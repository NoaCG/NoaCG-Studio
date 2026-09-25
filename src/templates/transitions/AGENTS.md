# src/templates/transitions - the cover-and-hold wipes

## transitions/ - the cover-and-hold wipes

tr01…tr04 (prefix 'transition', type 'transition', self-assembled) +
transitionPresets.ts (transition-slam / -wipe / -sweep). **THE ENTRANCE COVERS THE FRAME AND
HOLDS THERE** - that hold is the cut point, so every preset's entrance ends at full cover and
every exit takes the cover off the OTHER side (a transition that faded up and down in place
would expose the cut). The panels are authored AT their covering position in CSS, so a
thumbnail or a baseline still captures the cover moment. What clears it is the transition
TYPE's machine (types/transitions.ts): a `timer` arrow from the entrance waypoint straight to
the exit plus `exitOnNext`. **No preset schedules anything** - a setTimeout in a template is
motion the timeline cannot see, the control page cannot pause and the render clock cannot
drive.
