// The one place a match mode becomes rules. The core and UI ask `modeRules(state).<capability>`;
// they never compare the mode name. A match's mode is chosen once at start (state.match.mode, kept in saves).
import { classic } from './classic.js';
import { campaign } from './campaign.js';
export const RULE_SETS = { classic, campaign };
export const modeRules = state => RULE_SETS[state?.match?.mode] || classic;
