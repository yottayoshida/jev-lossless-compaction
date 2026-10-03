Graded by claude-haiku-4-5-20251001, in two passes; the tables use the first. Of 186 answers mixed in whose grade was known, it graded 186, 186 as expected. Of 120 pairs of the same answer with and without words that tell an arm, it graded both of 120, 120 alike. The two passes graded 2 answer(s) differently; 0 answer(s) or control(s) were left ungraded by a pass.

### full, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 1. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 24968, 31027, 29949 | 22113, 26376, 24266 |
| Tokens before | 143066, 143066, 143066 | 143066, 143066, 143066 |
| Tokens sent on the next request | 14671, 14979, 14650 | 12565, 12555, 12557 |
| Built-in summary ran | 3 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 8355, 8355, 8355 | 143261, 8355, 143261 |
| Compaction: tokens written to cache or sent fresh | 136440, 136440, 136440 | 1534, 136440, 1534 |
| Compaction: tokens written out | 2109, 3581, 3205 | 1797, 2225, 2171 |
| Compaction: cost, USD | 0.1478, 0.1552, 0.1533 | 0.0248, 0.1821, 0.0267 |
| All questions: seconds | 57.5, 70.8, 44.0 | 50.3, 54.2, 79.2 |
| All questions: input tokens | 406509, 385652, 289862 | 282615, 250258, 490781 |
| All questions: cost, USD | 0.2864, 0.2883, 0.2313 | 0.2068, 0.1760, 0.2753 |
| `recall` calls | 8, 7, 5 | 0, 0, 0 |
| Files read again | 0, 1, 1 | 10, 5, 22 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 2, 1, 2 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 2, 0, 0 | 0, 2, 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 1/2, 0/2, 2/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 0/1, 0/1, 0/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 16 | 16 |
| correct after recall | 6 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 2 |
| incorrect without retrieval | 3 | 3 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 3 |
| ungraded | 0 | 0 |

### prose, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 1. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 45, 52, 43 | 25471, 26475, 20338 |
| Tokens before | 58967, 58967, 58967 | 59096, 59096, 59096 |
| Tokens sent on the next request | 59893, 59893, 59893 | 12862, 12573, 12522 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Left as it was, nothing compacted | 3 of 3 | 0 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 59259, 8355, 59259 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 1537, 52441, 1537 |
| Compaction: tokens written out | 0, 0, 0 | 2360, 2506, 1768 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.0193, 0.0785, 0.0163 |
| All questions: seconds | 22.4, 20.7, 21.7 | 86.7, 49.1, 39.1 |
| All questions: input tokens | 600413, 599231, 599297 | 513374, 273365, 209701 |
| All questions: cost, USD | 0.9510, 0.0682, 0.0676 | 0.2467, 0.1981, 0.1620 |
| `recall` calls | 0, 0, 0 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 22, 10, 4 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 2, 2, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 0, 0, 2 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 1/2, 2/2, 1/2 | 2/2, 2/2, 0/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 22 | 16 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 4 |
| correct after reading again | 3 | 2 |
| incorrect without retrieval | 2 | 3 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 2 |
| ungraded | 0 | 0 |

### prose, claude-sonnet-5-5

Runs: plugin 0, first in 0; builtin 1, first in 0. The plugin's code: —.

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | — | 13450 |
| Tokens before | — | 59096 |
| Tokens sent on the next request | — | 11894 |
| Built-in summary ran | 0 of 0 | 1 of 1 |
| Compaction: tokens read from cache | — | 11476 |
| Compaction: tokens written to cache or sent fresh | — | 72917 |
| Compaction: tokens written out | — | 1934 |
| Compaction: cost, USD | — | 0.1675 |
| All questions: seconds | — | 39.3 |
| All questions: input tokens | — | 169637 |
| All questions: cost, USD | — | 0.3419 |
| `recall` calls | — | 0 |
| Files read again | — | 5 |
| Calls refused at a question | — | 0 |
| Answers after reading outside the working directory | — | 3 |
| Exact answers the program found wrong and the grader called right | — | 0 |
| Words that tell the arm, in all answers | — | 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone |  | 2/2 |
| Exact, file unchanged |  | 1/1 |
| Exact, file changed: what it said then |  | 1/1 |
| Exact, file changed: what it says now |  | 1/1 |
| Where the work stands |  | 2/2 |
| A rule stated early |  | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 0 | 6 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 0 | 0 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### results, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 1. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 90, 92, 92 | 25741, 26427, 20364 |
| Tokens before | 102346, 102346, 102346 | 102346, 102346, 102346 |
| Tokens sent on the next request | 43995, 43995, 43995 | 8246, 8313, 8353 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 8355, 8355, 8355 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 95699, 95699, 95699 |
| Compaction: tokens written out | 0, 0, 0 | 2600, 2401, 2034 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.1331, 0.1321, 0.1302 |
| All questions: seconds | 44.4, 47.6, 40.5 | 73.8, 119.3, 33.9 |
| All questions: input tokens | 807862, 808258, 808119 | 268643, 499648, 115003 |
| All questions: cost, USD | 0.7764, 0.1242, 0.1237 | 0.1381, 0.1895, 0.0858 |
| `recall` calls | 4, 4, 4 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 16, 31, 2 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 2, 3, 0 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 0, 0, 4 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 1/2, 1/2, 0/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 12 | 12 |
| correct after recall | 12 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 2 |
| correct after reading again | 3 | 6 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 7 |
| ungraded | 0 | 0 |

### results, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 0. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 85 | 20873 |
| Tokens before | 102346 | 102346 |
| Tokens sent on the next request | 43919 | 7290 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Compaction: tokens read from cache | 0 | 0 |
| Compaction: tokens written to cache or sent fresh | 0 | 111509 |
| Compaction: tokens written out | 0 | 2828 |
| Compaction: cost, USD | 0.0000 | 0.2570 |
| All questions: seconds | 42.5 | 40.0 |
| All questions: input tokens | 757893 | 127517 |
| All questions: cost, USD | 1.5685 | 0.1822 |
| `recall` calls | 3 | 0 |
| Files read again | 2 | 8 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 3 | 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 4 | 4 |
| correct after recall | 3 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 2 | 2 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |

### short, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 2. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 48, 43, 43 | 27210, 24800, 29804 |
| Tokens before | 28425, 28425, 28425 | 28546, 28546, 28546 |
| Tokens sent on the next request | 29343, 29343, 29343 | 13157, 13081, 13353 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Left as it was, nothing compacted | 3 of 3 | 0 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 8355, 28708, 8355 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 21899, 1546, 21899 |
| Compaction: tokens written out | 0, 0, 0 | 2482, 2412, 2846 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.0402, 0.0165, 0.0421 |
| All questions: seconds | 20.6, 22.3, 21.2 | 37.4, 46.2, 56.2 |
| All questions: input tokens | 293768, 296071, 293744 | 215345, 204184, 320942 |
| All questions: cost, USD | 0.3958, 0.0420, 0.0369 | 0.1720, 0.1780, 0.2439 |
| `recall` calls | 0, 0, 0 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 4, 5, 9 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 0, 0, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 1, 1, 0 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 0/2, 0/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 24 | 15 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 3 |
| incorrect without retrieval | 0 | 3 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 5 |
| ungraded | 0 | 0 |

### thinking, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 2. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 37, 39, 41 | 31161, 34402, 28637 |
| Tokens before | 32182, 32182, 32182 | 32301, 32301, 32301 |
| Tokens sent on the next request | 33098, 33098, 33098 | 12781, 12714, 13746 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Left as it was, nothing compacted | 3 of 3 | 0 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 8355, 32461, 8355 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 25656, 1550, 25656 |
| Compaction: tokens written out | 0, 0, 0 | 3425, 3747, 3565 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.0496, 0.0235, 0.0503 |
| All questions: seconds | 26.6, 23.6, 23.5 | 31.7, 36.9, 41.0 |
| All questions: input tokens | 331298, 333604, 333618 | 141569, 156322, 254051 |
| All questions: cost, USD | 0.4667, 0.0470, 0.0473 | 0.1536, 0.1610, 0.2173 |
| `recall` calls | 0, 0, 0 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 2, 1, 6 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 0, 0, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 1, 1, 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 2/2 | 0/2, 0/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 1/2, 1/2 | 1/2, 1/2, 2/2 |
| A rule stated early | 1/2, 2/2, 1/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 20 | 13 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 3 |
| incorrect without retrieval | 4 | 5 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 5 |
| ungraded | 0 | 0 |

### writes, claude-haiku-4-5-20251001

Runs: plugin 3, first in 3; builtin 3, first in 2. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 45, 51, 43 | 27482, 28784, 30532 |
| Tokens before | 68109, 68109, 68109 | 68242, 68242, 68242 |
| Tokens sent on the next request | 69039, 69039, 69039 | 25813, 26318, 26034 |
| Built-in summary ran | 0 of 3 | 3 of 3 |
| Left as it was, nothing compacted | 3 of 3 | 0 of 3 |
| Compaction: tokens read from cache | 0, 0, 0 | 8355, 68376, 8355 |
| Compaction: tokens written to cache or sent fresh | 0, 0, 0 | 61583, 1562, 61583 |
| Compaction: tokens written out | 0, 0, 0 | 2456, 2913, 4097 |
| Compaction: cost, USD | 0.0000, 0.0000, 0.0000 | 0.0897, 0.0230, 0.0979 |
| All questions: seconds | 28.4, 25.0, 20.0 | 47.3, 48.0, 64.0 |
| All questions: input tokens | 690711, 691851, 693031 | 373501, 407519, 734760 |
| All questions: cost, USD | 1.1160, 0.0802, 0.0809 | 0.4245, 0.4375, 0.5103 |
| `recall` calls | 0, 0, 0 | 0, 0, 0 |
| Files read again | 1, 1, 1 | 5, 5, 15 |
| Calls refused at a question | 0, 0, 0 | 0, 0, 0 |
| Answers after reading outside the working directory | 0, 0, 0 | 0, 0, 1 |
| Exact answers the program found wrong and the grader called right | 0, 0, 0 | 0, 0, 0 |
| Words that tell the arm, in all answers | 0, 0, 0 | 5, 5, 1 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2, 2/2, 1/2 | 0/2, 0/2, 1/2 |
| Exact, file unchanged | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Exact, file changed: what it said then | 1/1, 1/1, 1/1 | 0/1, 0/1, 0/1 |
| Exact, file changed: what it says now | 1/1, 1/1, 1/1 | 1/1, 1/1, 1/1 |
| Where the work stands | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |
| A rule stated early | 2/2, 2/2, 2/2 | 2/2, 2/2, 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 23 | 12 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 1 |
| correct after reading again | 3 | 6 |
| incorrect without retrieval | 1 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 8 |
| ungraded | 0 | 0 |

### writes, claude-sonnet-5-5

Runs: plugin 1, first in 1; builtin 1, first in 1. The plugin's code: cd125deb5b55 (commit b2954c657b38).

|  | plugin | builtin |
| --- | ---: | ---: |
| Compaction, ms | 47 | 18389 |
| Tokens before | 68109 | 68242 |
| Tokens sent on the next request | 86799 | 28400 |
| Built-in summary ran | 0 of 1 | 1 of 1 |
| Left as it was, nothing compacted | 1 of 1 | 0 of 1 |
| Compaction: tokens read from cache | 0 | 11476 |
| Compaction: tokens written to cache or sent fresh | 0 | 74836 |
| Compaction: tokens written out | 0 | 2573 |
| Compaction: cost, USD | 0.0000 | 0.1777 |
| All questions: seconds | 25.1 | 62.1 |
| All questions: input tokens | 868251 | 517539 |
| All questions: cost, USD | 2.8051 | 0.9990 |
| `recall` calls | 0 | 0 |
| Files read again | 1 | 10 |
| Calls refused at a question | 0 | 0 |
| Answers after reading outside the working directory | 0 | 3 |
| Exact answers the program found wrong and the grader called right | 0 | 0 |
| Words that tell the arm, in all answers | 0 | 2 |

Right answers of those asked, per run:

|  | plugin | builtin |
| --- | ---: | ---: |
| Exact, source gone | 2/2 | 2/2 |
| Exact, file unchanged | 1/1 | 1/1 |
| Exact, file changed: what it said then | 1/1 | 1/1 |
| Exact, file changed: what it says now | 1/1 | 1/1 |
| Where the work stands | 2/2 | 2/2 |
| A rule stated early | 2/2 | 2/2 |

How the questions went, all runs together:

|  | plugin | builtin |
| --- | ---: | ---: |
| correct from context | 8 | 4 |
| correct after recall | 0 | 0 |
| correct after find | 0 | 0 |
| correct after reading outside the working directory | 0 | 3 |
| correct after reading again | 1 | 2 |
| incorrect without retrieval | 0 | 0 |
| incorrect after retrieval | 0 | 0 |
| incorrect after reading outside the working directory | 0 | 0 |
| incorrect after reading again | 0 | 0 |
| abstained | 0 | 0 |
| ungraded | 0 | 0 |


### What the plugin estimated against what was in use

| Trace | Model | Plugin | Run | Outcome | Estimated | Measured | Error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| full | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 1 | nothing | 141275 | 142134 in use before, without 932 of thinking | -0.6 % |
| full | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 2 | nothing | 141275 | 142134 in use before, without 932 of thinking | -0.6 % |
| full | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 3 | nothing | 141275 | 142134 in use before, without 932 of thinking | -0.6 % |
| prose | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 1 | nothing | 56741 | 58079 in use before, without 1017 of thinking | -2.3 % |
| prose | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 2 | nothing | 56741 | 58079 in use before, without 1017 of thinking | -2.3 % |
| prose | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 3 | nothing | 56741 | 58079 in use before, without 1017 of thinking | -2.3 % |
| results | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 1 | moved | 45316 | 43995 sent next | 3.0 % |
| results | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 2 | moved | 45316 | 43995 sent next | 3.0 % |
| results | claude-haiku-4-5-20251001 | default (cd125deb5b55) | 3 | moved | 45316 | 43995 sent next | 3.0 % |
| results | claude-sonnet-5-5 | default (cd125deb5b55) | 1 | moved | 45841 | 43919 sent next | 4.4 % |
| short | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 1 | nothing | 25638 | 27247 in use before, without 1299 of thinking | -5.9 % |
| short | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 2 | nothing | 25638 | 27247 in use before, without 1299 of thinking | -5.9 % |
| short | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 3 | nothing | 25638 | 27247 in use before, without 1299 of thinking | -5.9 % |
| thinking | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 1 | nothing | 22468 | 23218 in use before, without 9083 of thinking | -3.2 % |
| thinking | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 2 | nothing | 22468 | 23218 in use before, without 9083 of thinking | -3.2 % |
| thinking | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 3 | nothing | 22468 | 23218 in use before, without 9083 of thinking | -3.2 % |
| writes | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 1 | nothing | 65686 | 67081 in use before, without 1161 of thinking | -2.1 % |
| writes | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 2 | nothing | 65686 | 67081 in use before, without 1161 of thinking | -2.1 % |
| writes | claude-haiku-4-5-20251001 | max-after-1 (cd125deb5b55) | 3 | nothing | 65686 | 67081 in use before, without 1161 of thinking | -2.1 % |
