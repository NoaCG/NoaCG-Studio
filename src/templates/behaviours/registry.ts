// The BEHAVIOUR RECIPES, by id (docs/SVG_BEHAVIOUR_PLAN.md §7).
//
// One list, read by the compiler (importedDesign/behaviour.ts), the mapping step's offer and
// pickers, the name-based proposal, and the designer-facing page that is generated from these
// declarations - so a role word taught in the docs is the word the matcher reads, and nothing
// can drift between them. Adding a behaviour is adding a declaration here.

import type { BehaviourRecipe } from './recipe';
import { quizRecipe } from './quiz';
import { scoreRecipe } from './score';
import { countdownRecipe } from './countdown';
import { voteRecipe } from './vote';

export const BEHAVIOUR_RECIPES: readonly BehaviourRecipe[] = [quizRecipe, scoreRecipe, countdownRecipe, voteRecipe];

export function recipeById(id: string): BehaviourRecipe | null {
  return BEHAVIOUR_RECIPES.find((r) => r.id === id) ?? null;
}
