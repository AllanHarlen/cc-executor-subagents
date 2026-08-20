#!/usr/bin/env node
/**
 * Compatibility wrapper.
 *
 * The canonical collect-test-results script lives inside the skill directory so
 * SKILL.md can reference it through ${CLAUDE_SKILL_DIR}. Keep this wrapper
 * for README examples and command invocations that point at scripts/collect-test-results.mjs.
 */
import "../skills/executor-subagents/scripts/collect-test-results.mjs";
