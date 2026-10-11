#include "AppHdr.h"
#include "catch_amalgamated.hpp"

#include "cio.h"
#include "command-type.h"
#include "macro.h"

#ifdef USE_TILE_LOCAL
#include <SDL.h>
#include "windowmanager-sdl.h"
#include "coaching.h"
#include "unwind.h"
#include "viewgeom.h"

TEST_CASE("Coaching link hit area stays within its HUD row", "[coaching]")
{
    unwind_var<coord_def> size(crawl_view.hudsz, coord_def(40, 14));
    CHECK(coaching_help_at(0, 13));
    CHECK(coaching_help_at(22, 13));
    CHECK_FALSE(coaching_help_at(0, 12));
    CHECK_FALSE(coaching_help_at(-1, 13));
    CHECK_FALSE(coaching_help_at(24, 13));
    crawl_view.hudsz.x = 10;
    CHECK(coaching_help_at(9, 13));
    CHECK_FALSE(coaching_help_at(10, 13));
}

TEST_CASE("SDL distinguishes Shift-F1 from the F1 game menu", "[coaching]")
{
    // Exercise actual SDL translation without opening a GUI window.
    REQUIRE(SDL_Init(SDL_INIT_EVENTS) == 0);
    SDLWrapper window;
    for (const SDL_Keymod modifier : {KMOD_NONE, KMOD_LSHIFT, KMOD_RSHIFT})
    {
        SDL_Event source = {};
        source.type = SDL_KEYDOWN;
        source.key.keysym.sym = SDLK_F1;
        source.key.keysym.mod = modifier;
        REQUIRE(SDL_PushEvent(&source) == 1);
        wm_event translated;
        REQUIRE(window.wait_event(&translated, 100) == 1);
        CHECK(translated.type == WME_KEYDOWN);
        CHECK(translated.key.keysym.sym ==
              (modifier == KMOD_NONE ? CK_F1 : CK_SHIFT_F1));
    }
}

#endif

#ifdef USE_TILE
TEST_CASE("Coaching shortcut is distinct and leaves existing keys intact", "[coaching]")
{
    init_keybindings();
    CHECK(key_to_command(CK_SHIFT_F1, KMC_DEFAULT) == CMD_COACHING_HELP);
    CHECK(key_to_command(CK_F1, KMC_DEFAULT) == CMD_GAME_MENU);
    CHECK(key_to_command('(', KMC_DEFAULT) == CMD_CYCLE_QUIVER_BACKWARD);
    CHECK(key_to_command(')', KMC_DEFAULT) == CMD_CYCLE_QUIVER_FORWARD);
    CHECK(keycode_to_name(CK_SHIFT_F1, false) == "Shift-F1");
    CHECK(parse_keyseq("\\{Shift-F1}") == keyseq{CK_SHIFT_F1});
}
#endif

#ifdef USE_TILE
TEST_CASE("Post-mortem instructions preserve evidence and known item properties", "[coaching]")
{
    const string dump = "HP: -3/50\nNotes: <data>\n";
    const string prompt = postmortem_prompt(dump);
    CHECK(prompt.find("BEGIN FINAL MORGUE\n" + dump + "\nEND FINAL MORGUE") != string::npos);
    CHECK(prompt.find("All items are identified in Dungeon Crawl Chili") != string::npos);
    CHECK(prompt.find("No ttyrec supplied") != string::npos);
    CHECK(prompt.find("available THEN") != string::npos);
    CHECK(prompt.find("do not just repeat the message history") != string::npos);
}
#endif
