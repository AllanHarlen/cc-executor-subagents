#!/usr/bin/env node
/**
 * Compatibility wrapper.
 *
 * The canonical validate-wire-format script lives inside the skill directory so
 * SKILL.md can reference it through ${CLAUDE_SKILL_DIR}. Keep this wrapper
 * for README examples and command invocations that point at scripts/validate-wire-format.mjs.
 */
import "../skills/executor-subagents/scripts/validate-wire-format.mjs";
