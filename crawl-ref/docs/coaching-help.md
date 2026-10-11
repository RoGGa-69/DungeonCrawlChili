# Coaching Help prototype

## Webtiles

Press **Shift-F1**, click **Coaching Help [Shift-F1]** under the player stats,
or choose **Coaching Help** in the F1 menu. The game saves a fresh live morgue
file using the same settings as `#` and opens a coaching dialog.

Choose **ChatGPT**, **Claude**, **Gemini**, or **Copilot** in the AI service
dropdown, then choose **Copy and open [B]** and paste the copied prompt and dump
into that service. The browser remembers the selection when storage is
available. This uses the player's browser session and account; the game
server does not need an API key or Codex login. The clipboard prompt includes
short tactical coaching instructions followed by the complete live dump.
**C** copies without opening a tab, and **Escape** returns to play.

If clipboard access is unavailable, the dialog offers selectable text for
manual copying. Spectators cannot launch coaching or use its copy/open
controls. No request is sent to an AI by the game server.

The popup carries the complete prompt and live dump through the normal
Webtiles protocol, so shared servers do not need a Chili-specific Python
handler or a browser download from the morgue domain. Existing game processes
need to be saved and reopened with the
updated Chili binary; refresh the browser to load the updated web client.

Web checks (from `source/`): `node webserver/tests/coaching.test.js` and
`python3 webserver/tests/test_coaching_routing.py`.

## Local Tiles

In local Tiles, press **Shift-F1**, click **Coaching Help [Shift-F1]** under
the player stats, or choose **Coaching Help** in the F1 game menu.
Normal F1 and the quiver keys `(` and `)` keep their existing actions.

Coaching Help saves a fresh live character morgue file, exactly as `#` does,
and opens a dialog with a clickable **AI service** dropdown for **ChatGPT**,
**Claude**, **Gemini**, and **Copilot**. Click it or press **A**, then choose
with the mouse, arrow keys and Enter/Space, or **1–4**. Tab moves between
controls; Escape closes an expanded dropdown before returning to play.
The selection is remembered while the game is running. It uses the
normal live dump settings, including `dump_order`, and does not identify
unknown items or expose the raw save game. The player remains in control:
advice never executes game commands, and asking does not take a turn.
The dump can include the character name, seed, notes and message history.

All four services support copying the prompt and opening their website in
the player's browser. Paste there using the player's own account. To get
ChatGPT advice directly inside Tiles on Linux/macOS, install Python 3 and a
current Codex CLI, then run
`codex login` in a terminal and sign in with ChatGPT. Coaching uses that
player's ChatGPT/Codex allowance and the CLI's default OpenAI model. With
ChatGPT selected, choose **Get in-game ChatGPT advice [G]** to send a request;
opening the dialog or choosing another provider does not start that request.
The prototype ignores custom Codex configuration, disables tools and web
search, and requests a temporary read-only session. It does not install
Codex, copy credentials, use API keys, or bill a developer's account.

Escape cancels a pending request. Advice appears inside the game with:

- **B**: copy the coaching prompt and dump, then open the selected AI service.
- **C**: copy only.
- **Escape**: return to the game.

If Codex is unavailable, signed out, or has exhausted its allowance, the
same browser fallback remains available. Paste the copied text into the selected AI;
sign-in and free usage depend on the player's account and current service
availability. A ChatGPT subscription does not provide anonymous free API
tokens to other players. Windows currently uses the browser fallback.

The model sees only the dump, so it may lack exact enemy positions or
fork-specific mechanics. Advice is a prototype and can be mistaken. Saved
live morgue files remain on disk as usual; temporary request/response files
are removed after each request. No automatic background coaching is sent.

Bridge checks: `python3 dat/coaching/test_chatgpt_coach.py` from `source/`.

## Post-mortem analysis

At the game-over screen, click **Post-mortem analysis [P]** or press **P**.
This uses the final morgue, including the existing death recap, rather than
saving another live dump. It also works for completed wins and quits.
Choose ChatGPT, Claude, Gemini, or Copilot and use **B** to copy/open or **C**
to copy only. Paste the context into the chosen service using your own account.
No server API key or separate browser app is required.

An optional ttyrec adds timestamped terminal screen excerpts. The converter
samples changed screens across the recording and retains finer detail near
the end, within a 120,000-character excerpt budget. These are output frames,
not keypresses or turns: partial redraws, unsupported terminal operations,
and omitted screens limit what can be concluded. The analysis explicitly
separates evidence from inference and checks for a mismatched recording.
All items are identified in Chili; the prompt treats their properties as
known, while requiring evidence that a resource was available at the time.

In desktop Tiles, press **T** and enter the recording's file path. Python 3
supports uncompressed ttyrec, `.gz`, and `.bz2` files, including `~/` paths.
The recording replaces any previous attachment. Enter an empty path to
remove it and return to morgue-only analysis. Tiles does not create a
recording automatically. With ChatGPT selected, **G** requests the analysis
through the player's Codex login, and displays a scrollable report inside
Tiles. Escape returns from the report to the analysis chooser.

In Webtiles, use the optional file chooser for an **uncompressed .ttyrec**.
Decompress `.gz`/`.bz2` recordings first. The browser reads and converts the
file locally; it is not uploaded to the game server. **Use morgue only**
removes the attachment. Choose the recording from the same completed run;
server-side recording discovery is not automatic. Spectators cannot launch
analysis controls. Browsers use copy/paste for all four providers.

Recording input is limited to 50 MiB after decompression and 500,000 frames.
Invalid/truncated recordings show an error and preserve the current context.
Nothing is sent to an AI until the player requests in-game analysis or
pastes the copied context into a service. The report asks for the fatal
sequence, an earlier recoverable decision, concrete alternative actions,
strategic patterns, and three practical lessons, in up to 1,200 words.

Additional checks (from `source/`):
`python3 dat/coaching/test_ttyrec_transcript.py` and
`node webserver/tests/ttyrec.test.js`.

## Deployment on shared Webtiles servers

Coaching Help and post-mortem analysis use the normal game popup protocol.
CXC, CPO, DCF, and other hosts need only their normal Chili build/install and
a browser refresh. No Chili-specific shared Python handler, server restart,
API key, or administrator-installed lobby scripts are required.

The corrected client loads its ttyrec decoder and worker from the versioned
game directory. Keep that loading fix when updating: the original client
requested `/static/scripts/ttyrec.js` from the shared lobby and could leave
Chili stuck on **Loading...**. DCF's temporary lobby copies supported cached
clients; a fresh deployment of the corrected Chili version does not need them.

Automatic server-side ttyrec attachment has been removed. Post-mortem
analysis copies the final morgue immediately; players can optionally select
a downloaded, uncompressed ttyrec to include browser-generated excerpts.
Shared handlers already patched for automatic attachment may retain that
code: the updated game no longer sends the request that activates it.
