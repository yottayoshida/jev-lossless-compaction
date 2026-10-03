# Usage

Three things, in the order you will meet them.

**A compaction.** A line starting `lossless-compaction:` says what each one
did. From a real session of `Read` results:

```text
lossless-compaction: moved 6 of 21 tool results out (844544 -> 548237 chars, about 52357 of 167000 tokens in use) in 61 ms
```

Each result that left has a ticket in its place:

```text
[moved out] Read result, 83261 bytes; recall with mcp__lossless-compaction__recall id ed8701f23087852c07ee8eb0b91b9335cc94cc8b21e42826c6b684299e8008e3
```

In a session where the plugin is enabled and is not running, a line says so
at the first message you send, naming the setting to add
([what else it does, and what it does not reach](limits.md#function-hooks)).

**`recall`.** The agent calls it with the id on a ticket and gets the result
back unchanged. It needs no key. An id the agent copied wrong is taken for the
one id written in the conversation that begins with its first 16 characters
([what is not taken](limits.md#what-an-agent-does-not-fetch)).

**`find`.** Optional. Asked in words, it returns the moved-out result of this
conversation that the question is about, or lists the likeliest few when Jev
is not sure which. Asked in other words which of thirteen moved-out results
reported a refusal on an unsupported kernel call, in a session where the
calls said nothing of what they returned, the agent called `find` and got it
back:

```text
[found] Bash result, 2271 bytes; id 968e6cdd8a21069b3907388db507c061ce28cac950b7a63eae5a0967adf39edc; probability 0.99
```

It needs a Jev key: set it with
`/plugin configure lossless-compaction@lossless-compaction` inside Claude
Code. For Jev on Cloudflare Workers AI, enter the account id there as well:
with `provider` left on `auto`, an account id entered there sends the key to
Cloudflare, and none sends it to TypeSafe.

With a key set, each call to `find` sends the provider:

- the agent's question;
- for every result moved out of the conversation, the call that made it and
  a 400-character digest of it;
- for every part of the conversation kept before a summary, the head of what
  was said in it;
- where one result alone has a line holding a number, a checksum or a code
  the question names: that it has, in one sentence, and no line of it.

Jev chooses among them, with "none of these" among the choices; a phrase of
twelve characters or more in double quotes is looked for as written first.
Shapes of secrets are blanked before anything is sent, which is a courtesy
and not a guarantee. A result that holds an image is not offered, and nothing
of it is sent. Without a key there is no `find`, and nothing is sent.
