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
and sends that text to ChatGPT through the local Codex CLI. It uses the
normal live dump settings, including `dump_order`, and does not identify
unknown items or expose the raw save game. The player remains in control:
advice never executes game commands, and asking does not take a turn.
The dump can include the character name, seed, notes and message history.

On Linux/macOS, install Python 3 and a current Codex CLI, then run
`codex login` in a terminal and sign in with ChatGPT. Coaching uses that
player's ChatGPT/Codex allowance and the CLI's default OpenAI model.
The prototype ignores custom Codex configuration, disables tools and web
search, and requests a temporary read-only session. It does not install
Codex, copy credentials, use API keys, or bill a developer's account.

Escape cancels a pending request. Advice appears inside the game with:

- **B**: copy the coaching prompt and dump, then open `chatgpt.com`.
- **C**: copy only.
- **Escape**: return to the game.

If Codex is unavailable, signed out, or has exhausted its allowance, the
same browser fallback remains available. Paste the copied text into ChatGPT;
sign-in and free usage depend on the player's account and current service
availability. A ChatGPT subscription does not provide anonymous free API
tokens to other players. Windows currently uses the browser fallback.

The model sees only the dump, so it may lack exact enemy positions or
fork-specific mechanics. Advice is a prototype and can be mistaken. Saved
live morgue files remain on disk as usual; temporary request/response files
are removed after each request. No automatic background coaching is sent.

Bridge checks: `python3 dat/coaching/test_chatgpt_coach.py` from `source/`.
