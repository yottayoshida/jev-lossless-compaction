#!/bin/sh
# Says when the plugin is enabled and is not running (ADR 0010).
#
#   notice.sh before   PreCompact: a /compact is held the first time, with what to change.
#   notice.sh after    SessionStart after a compaction: one line says it was Claude Code's own.
#   notice.sh prompt   UserPromptSubmit: one line, once in a process, says so before any compaction.
#
# A classic hook runs whether or not function hooks are on. The module, when it
# runs, sets LOSSLESS_COMPACTION_RUNNING to the id of its process; this file
# compares it with the CLAUDE_PID it is handed. No external command is run:
# every one is tens of milliseconds, in a hook a person waits for.

# The input is read first, always: a hook that leaves it unread can fail the write to it.
input=
while IFS= read -r line || [ -n "$line" ]; do input="$input$line"; done

mark=${LOSSLESS_COMPACTION_RUNNING:-}
pid=${CLAUDE_PID:-}
if [ -n "$pid" ]; then
  if [ "$mark" = "$pid" ] || [ "$mark" = any ]; then exit 0; fi
elif [ -n "$mark" ]; then
  # This process cannot be told from the one that started it: any mark counts.
  exit 0
fi

# What the plugin needs to run, said in every notice. Nothing is to be set: from
# this version on Claude Code runs a plugin's hooks module by default and ignores
# CLAUDE_CODE_ENABLE_FUNCTION_HOOKS. Run where there is no mod, claude plugin test
# says when modules were turned off by Anthropic or by a setting; what it does not
# say, an organization's allowManagedModsOnly among it, claude --debug does.
# No quote or backslash: it goes into JSON as it is.
version=2.1.287
needs="The plugin needs Claude Code $version or later (claude --version) and mods that are not turned off for you (claude plugin test, run in an empty directory, says when Anthropic or a setting turned them off)"

# Adds a line to one of the lists under the plugin's data directory, started
# again past fifty lines, for its owner alone. Fails when it cannot be written.
#   remember <file> <lines read> <last line ended: yes|no> <line>
remember() {
  umask 077
  if [ "$2" -ge 50 ]; then
    { printf '%s\n' "$4" > "$1"; } 2>/dev/null
  else
    # A last line without its newline gets one first, so the two are not joined.
    newline=; [ "$3" = no ] && newline='
'
    { printf '%s%s\n' "$newline" "$4" >> "$1"; } 2>/dev/null
  fi
}

if [ "${1:-}" = after ]; then
  # At startup this hook runs before the module has set the mark, so only after a compaction.
  case "$input" in *'"source":"compact"'*) ;; *) exit 0 ;; esac
  printf '{"systemMessage":"%s"}\n' "lossless-compaction is enabled but was not running: this compaction was Claude Code's own summary. $needs; with both, start a new session to have it compact. If both hold already, run claude --debug and look for lossless-compaction."
  exit 0
fi

if [ "${1:-}" = prompt ]; then
  # Once in a process: told lists the processes told. Without its own id, or a
  # place to remember, a process would be told at every prompt; it is not told,
  # and the two notices around a compaction still are.
  [ -n "$pid" ] || exit 0
  [ -n "${CLAUDE_PLUGIN_DATA:-}" ] || exit 0
  told=$CLAUDE_PLUGIN_DATA/told
  if [ -L "$told" ]; then exit 0; fi
  if [ -e "$told" ] && [ ! -r "$told" ]; then exit 0; fi
  lines=0
  ended=yes
  if [ -e "$told" ]; then
    while read -r was_pid _ || { [ -n "$was_pid" ] && ended=no; }; do
      lines=$((lines + 1))
      if [ "$was_pid" = "$pid" ]; then exit 0; fi
    done < "$told"
  fi
  remember "$told" "$lines" "$ended" "$pid" || exit 0
  # A systemMessage is shown, and is not added to the conversation as plain stdout would be.
  printf '{"systemMessage":"%s"}\n' "lossless-compaction is enabled but is not running in this session: a compaction here would be Claude Code's own summary, which cannot be undone. $needs; with both, start a new session. If both hold already, run claude --debug and look for lossless-compaction."
  exit 0
fi

[ "${1:-}" = before ] || exit 0
# Only a /compact is held: an automatic compaction that is stopped leaves the conversation to overflow.
case "$input" in *'"trigger":"manual"'*) ;; *) exit 0 ;; esac
# Without its own id a process would be held again every time, and without a place to remember, too.
[ -n "$pid" ] || exit 0
[ -n "${CLAUDE_PLUGIN_DATA:-}" ] || exit 0
held=$CLAUDE_PLUGIN_DATA/held
# A link is not followed. A file that cannot be read cannot say what was held, and would hold every time.
if [ -L "$held" ]; then exit 0; fi
if [ -e "$held" ] && [ ! -r "$held" ]; then exit 0; fi

session=
case "$input" in *'"session_id":"'*) session=${input#*'"session_id":"'}; session=${session%%'"'*} ;; esac
case "$session" in '' | - | *[!0-9a-fA-F-]*) session= ;; esac

# Through: this process was held before, or this conversation was held in two others.
# One other is not enough: reopened after what the notice names was put right, a
# conversation whose plugin still does not run must be held again, as the notice says it is.
lines=0
before=0
ended=yes
if [ -e "$held" ]; then
  while read -r was_pid was_session _ || { [ -n "$was_pid" ] && ended=no; }; do
    lines=$((lines + 1))
    if [ "$was_pid" = "$pid" ]; then exit 0; fi
    if [ -n "$session" ] && [ "$was_session" = "$session" ]; then before=$((before + 1)); fi
  done < "$held"
fi
if [ "$before" -ge 2 ]; then exit 0; fi

# What cannot be remembered is not held.
remember "$held" "$lines" "$ended" "$pid ${session:--}" || exit 0

if [ "$before" -ge 1 ]; then
  # The second time for this conversation, and the last: the next process goes through.
  printf '%s\n' "lossless-compaction is still not running, now in a second session of this conversation, so this /compact would be Claude Code's own summary, which cannot be undone. This conversation is not held again. $needs: check both before the next /compact, then run claude --debug and look for lossless-compaction to see why it does not run. To go ahead with the built-in summary, run /compact again in this session." >&2
else
  printf '%s\n' "lossless-compaction is enabled but is not running in this session, so this /compact would be Claude Code's own summary, which cannot be undone. $needs. With both, reopen this conversation with claude --resume${session:+ $session}, and run /compact there; if it is held again, the plugin is still not running. To go ahead with the built-in summary, run /compact again in this session." >&2
fi
exit 2
