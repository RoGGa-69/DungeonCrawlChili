#pragma once

#include <string>

const char *coaching_help_label();
bool coaching_help_at(int x, int y);
void show_coaching_help();
void show_postmortem_help(const std::string &dump);
std::string postmortem_prompt(const std::string &dump);

enum class coaching_provider { chatgpt, claude, gemini, copilot };
const char *coaching_provider_name(coaching_provider provider);
const char *coaching_provider_url(coaching_provider provider);
