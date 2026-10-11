#include "AppHdr.h"
#include "death-recap.h"

#include "player.h"
#include "item-name.h"
#include "item-prop.h"
#include "state.h"
#include "status.h"
#include "store.h"
#include "stringutil.h"

static const char *const HISTORY_KEY = "death_recap_turns";
static const char *const FINAL_KEY = "death_recap_final";

static bool _recording()
{
    return crawl_state.game_started && !crawl_state.game_is_arena()
           && !crawl_state.generating_level && you.num_turns >= 0;
}

static CrawlHashTable &_turn()
{
    if (!you.props.exists(HISTORY_KEY))
        you.props[HISTORY_KEY].new_vector(SV_HASH);
    CrawlVector &turns = you.props[HISTORY_KEY].get_vector();
    if (turns.empty()
        || turns[turns.size() - 1].get_table()["turn"].get_int() != you.num_turns)
    {
        if (turns.size() == 3)
            turns.erase(0);
        CrawlHashTable entry;
        entry["turn"] = you.num_turns;
        turns.push_back(entry);
    }
    CrawlHashTable &turn = turns[turns.size() - 1].get_table();
    if (!turn.exists("damage_total"))
    {
        turn["partial"] = turn.exists("events") && !turn["events"].get_vector().empty();
        turn["damage_total"] = 0;
        turn["healing_total"] = 0;
        turn["cost_total"] = 0;
        turn["hp_start"] = you.hp;
        turn["hp_end"] = you.hp;
        turn["hp_recorded"] = false;
        turn["sources"].new_table();
    }
    return turn;
}

void death_recap_begin_turn()
{
    if (!_recording())
        return;
    you.props.erase(FINAL_KEY);
    _turn();
}

void death_recap_hp_change(const string &source, int before, int after, int damage)
{
    if (!_recording() || before == after)
        return;
    CrawlHashTable &turn = _turn();
    if (!turn["hp_recorded"].get_bool())
    {
        turn["hp_start"] = before;
        turn["hp_recorded"] = true;
    }
    turn["hp_end"] = after;
    if (damage > 0)
    {
        turn["damage_total"].get_int() += damage;
        CrawlHashTable &sources = turn["sources"].get_table();
        const string key = !sources.exists(source) && sources.size() >= 12
            ? "Other sources" : source;
        if (!sources.exists(key))
        {
            CrawlHashTable totals;
            totals["damage"] = 0;
            totals["hits"] = 0;
            sources[key] = totals;
        }
        CrawlHashTable &totals = sources[key].get_table();
        totals["damage"].get_int() += damage;
        ++totals["hits"].get_int();
        if (after <= 0)
        {
            turn["fatal"] = make_stringf("%s dealt %d damage at %d HP%s",
                source.c_str(), damage, before,
                after < 0 ? make_stringf(" (%d overkill)", -after).c_str() : "");
        }
    }
    else if (after > before)
        turn["healing_total"].get_int() += after - before;
    else
        turn["cost_total"].get_int() += before - after;
}

string death_recap_text()
{
    string text = "Death recap (last three turns)\n";
    map<string, pair<int, int>> sources;
    int damage = 0, healing = 0, costs = 0;
    vector<string> hp_trend;
    string fatal;
    bool partial = false;
    if (you.props.exists(HISTORY_KEY))
    {
        for (const auto &value : you.props[HISTORY_KEY].get_vector())
        {
            const CrawlHashTable &turn = value.get_table();
            if (!turn.exists("damage_total"))
            {
                partial = true;
                continue;
            }
            partial |= turn["partial"].get_bool();
            damage += turn["damage_total"].get_int();
            healing += turn["healing_total"].get_int();
            costs += turn["cost_total"].get_int();
            if (hp_trend.empty())
                hp_trend.push_back(make_stringf("%d", max(0, turn["hp_start"].get_int())));
            hp_trend.push_back(make_stringf("%d", max(0, turn["hp_end"].get_int())));
            if (turn["turn"].get_int() == you.num_turns && turn.exists("fatal"))
                fatal = turn["fatal"].get_string();
            for (const auto &source : turn["sources"].get_table())
            {
                sources[source.first].first += source.second.get_table()["damage"].get_int();
                sources[source.first].second += source.second.get_table()["hits"].get_int();
            }
        }
    }
    if (!fatal.empty())
        text += "  Fatal hit: " + fatal + "\n";
    if (!hp_trend.empty())
    {
        text += "  HP by turn: " + join_strings(hp_trend.begin(), hp_trend.end(), " -> ") + "\n";
        text += make_stringf("  Damage taken: %d; HP restored: %d", damage, healing);
        if (costs)
            text += make_stringf("; other HP lost: %d", costs);
        text += "\n";
    }
    else
        text += "  No recent damage summary recorded.\n";
    if (partial)
        text += "  Partial summary: some turns predate this recap format.\n";

    vector<pair<string, pair<int, int>>> ranked(sources.begin(), sources.end());
    sort(ranked.begin(), ranked.end(), [](const pair<string, pair<int, int>> &a,
                                         const pair<string, pair<int, int>> &b) {
        return a.second.first != b.second.first ? a.second.first > b.second.first
                                                : a.first < b.first;
    });
    if (!ranked.empty())
        text += "  Main damage sources:\n";
    int other_damage = 0;
    for (size_t i = 0; i < ranked.size(); ++i)
    {
        if (i >= 3)
        {
            other_damage += ranked[i].second.first;
            continue;
        }
        text += make_stringf("    %s: %d (%d%%), %d hit%s\n", ranked[i].first.c_str(),
            ranked[i].second.first, ranked[i].second.first * 100 / max(1, damage),
            ranked[i].second.second, ranked[i].second.second == 1 ? "" : "s");
    }
    if (other_damage)
        text += make_stringf("    Other sources: %d\n", other_damage);

    vector<string> statuses;
    for (status_iterator si; si; ++si)
    {
        status_info info;
        if (fill_status_info(*si, info) && !info.short_text.empty())
            statuses.push_back(info.short_text);
    }
    text += "  At death: " + (statuses.empty() ? string("no active status effects")
        : comma_separated_line(statuses.begin(), statuses.end())) + "\n";

    int curing = 0, heal_wounds = 0, blinking = 0, teleport = 0;
    for (const item_def &item : you.inv)
    {
        if (!item.defined() || !item_type_known(item))
            continue;
        if (item.base_type == OBJ_POTIONS && item.sub_type == POT_CURING)
            curing += item.quantity;
        if (item.base_type == OBJ_POTIONS && item.sub_type == POT_HEAL_WOUNDS)
            heal_wounds += item.quantity;
        if (item.base_type == OBJ_SCROLLS && item.sub_type == SCR_BLINKING)
            blinking += item.quantity;
        if (item.base_type == OBJ_SCROLLS && item.sub_type == SCR_TELEPORTATION)
            teleport += item.quantity;
    }
    text += make_stringf("  Known supplies left: curing %d, heal wounds %d, blink %d, teleport %d\n\n",
                         curing, heal_wounds, blinking, teleport);
    return text;
}

void death_recap_finish()
{
    you.props[FINAL_KEY] = death_recap_text();
}

string final_death_recap()
{
    return you.props.exists(FINAL_KEY) ? you.props[FINAL_KEY].get_string() : "";
}
