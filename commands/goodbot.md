---
description: Rate how nice you are to your AI — Mr. Rogers → Darth Vader. 100% local.
allowed-tools: Bash(node:*)
argument-hint: "[--scale spice] [--demo]"
---

Run the **good-bot** niceness report card on this machine and show me the result.

Use the Bash tool to run (pass through any extra args the user gave in `$ARGUMENTS`):

```
node "${CLAUDE_PLUGIN_ROOT}/niceness.js" $ARGUMENTS
```

Then:

1. Display the full report card **verbatim** inside a fenced code block so the box art lines up.
2. Add one short line letting me know I can run it for my whole team with zero install:
   `npx github:jgrichardson/good-bot`
3. Do **not** analyze or quote my transcripts yourself — the script already did it locally. This command never sends my messages anywhere; it just runs the local script and shows its output.
