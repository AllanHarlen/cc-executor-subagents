#!/usr/bin/env node
/**
 * Compatibility wrapper.
 *
 * The canonical handoff validator script lives inside the skill directory so
 * SKILL.md can reference it through ${CLAUDE_SKILL_DIR}. Keep this wrapper for
 * README examples and command invocations that point at
 * scripts/validate-handoff.mjs.
 */
import "../skills/executor-subagents/scripts/validate-handoff.mjs";
