# B2 matcher detail review

[Review the updated assembly](https://cad.onshape.com/documents/cc4111ace6f0da6f2cc5eff1/w/ce35573ed40773819fb3d283/e/662af5ae6926c0454d4e1c04).

The review branch **B2 website matcher detail - 2026-10-07** starts from YL’s B2, saved as version `872e834ef0a98e731e09d638`. Main and B2 were verified unchanged after the update. Nothing has been merged or published to GitBook.

## Geometry and placement

All three capacitors now use ordinary Onshape sketches, extrudes, linear patterns and composite parts. Their 131 standard features are grouped into **C1 — editable features**, **C2 — editable features**, and **C3 — editable features** in the existing **Capacitors and RF wiring** Part Studio. No additional tabs were created for this rebuild. Separate fixed and moving composite components are provided for each capacitor. The coil and RF wiring retain their existing custom feature.

C1/C2 stators use two circular arcs and six straight edges. Their rotors use one circular arc and two straight edges; C2 retains an offset arc center. C3 uses an elliptical stator arc, a circular shaft relief, and straight edges; its rotor uses one circular arc and two straight edges. These deliberately simplified contours replace sampled polygon curves. They are visual approximations, including C2’s simplified tuning contour.

The original simplified B2 capacitors anchor the reconstruction’s mounting coordinates, envelopes, shafts and coupler positions. Website reconstruction data supplies the visible detail. The native capacitors retain the saved plate count, thickness, spacing and shaft coordinates. All 1,664 occurrence transforms common to the before/after assembly snapshots are exactly unchanged. The six previous generated capacitor instances were replaced by the native components, and their three generator features are retained suppressed in **Previous capacitor generators**. Four original simplified instances and their obsolete mates also remain suppressed.

The capacitor assembly group is valid. Four existing screw mates (**Fastened 14–17**) have missing connector references, already evident in the pre-switch assembly snapshot. Their parameters and occurrence positions were preserved; they remain outside this capacitor rebuild’s scope.

`geometry-input.json` records the geometry input and website source hashes. `build_native_capacitors.py` creates the standard-feature definitions; `run_native_capacitors.py` submits them sequentially and resolves server-assigned feature IDs. `verify_native_capacitors.py` reads body counts, plate bounds and reference-pose clearance. The older FeatureScript files remain available for the preserved generators and RF wiring.

## Accuracy and motion

Plate contours, counts, thicknesses and hidden wiring routes are photo estimates, not measured fabrication dimensions. Shaft bores and tie-rod clearances were added to the website-derived profiles. The Onshape collision check found zero rotor-to-stator interferences at the saved reference pose for all three capacitors. This does not establish clearance throughout rotation or against every surrounding assembly component.

Open the relevant capacitor folder and double-click **fixed plate count** or **plate thickness** to edit its variables. Edit **stator plate profile** or **rotor plate profile** for the native curves. Edit the extrudes for depth/offset and the linear patterns for repetition. The sketches retain free degrees of freedom and are not fully constrained fabrication drawings. `native-clearance-report.json` records 74 fixed/19 moving bodies for C1 and C2, and 113 fixed/31 moving bodies for C3, with zero rotor-to-fixed interference reports at the saved pose.

The assembly group **Website hardware — reference pose** holds the hardware to the existing fixed chassis. Independent motor/rotor motion has not been implemented; revise the group and add appropriate assembly mates before using it for a motion study.

## Reversibility

Switch back to **B2** or **Main** to see the source models. Within the review branch, Onshape history can restore the saved baseline or the earlier generated capacitor implementation. The original simplified components, obsolete mates and previous generator features are suppressed. The six replaced generated assembly instances are recoverable through Onshape history. `review-record.json` records the old and replacement identities.

An earlier Main-based setup branch, **Website matcher reconstruction — 2026-10-07**, remains superseded. Use the B2-based review link above.

## Request budget

The user raised the task cap to 275 signed requests. All 275 requests have now been used. The final count is recorded in `review-record.json`; it includes failed attempts and the initial connection check. `client.py` enforces the cap and limits mutations to the review branch. This count covers the signed client, not the browser’s own requests. Credentials are read from the user’s private configuration file and never stored here. Raw API snapshots and request state remain local and are ignored by Git.

## Name cleanup

Visible part and feature names omit estimate wording. Accuracy information remains in descriptions and these notes. The working Part Studio is **Capacitors and RF wiring** and its support Feature Studio is **Matcher generator**. The capacitor rebuild uses standard features; only the retained coil/RF feature remains custom driven. `native-editable-features-preview.png` shows the completed model and C1’s normal feature tree.

## Tab organization

The review branch now has six top-level folders, reduced from 71 top-level items. All 281 element IDs were verified preserved; no CAD tabs were deleted. The existing **F25 Files** and **CAD Imports** folder trees are unchanged.

- **Matcher**: Matcher Assembly, Impedance Matcher chassis, and Capacitors and RF wiring.
- **VSWR**: all 50 reconstruction iteration tabs and the three existing VSWR tabs, retaining their order.
- **Component parts**: 11 existing component tabs, including the simplified capacitors, fan, coupler, screen, PCB and mounting hardware.
- **Model support**: the reference image and Matcher generator.
- **F25 Files** and **CAD Imports**: existing source folders.

Open **Matcher** in the bottom bar to work with only its three tabs. Use the home icon to return to the six folders, or **Alt+T** to open the tab manager. Folder organization is reversible through Onshape history or the folder's **Unpack** command, which returns its tabs to the parent. `tabs-organized.jpg` shows the verified layout.
## Box and Housing cleanup — 2026-10-08

The current review workspace is named **B2 reorganization**. Its **Box and Housing** Part Studio now has nine additional feature folders: six inside Main Electronics Housing and three for the loose previous back plate, lid opening and final support features. Fifteen sketches and operations were renamed to describe their purpose. All 73 feature IDs and their build order are preserved. The existing assembly mates and the user's PCB alignment were not edited.

The active housing mounting sketch had two failed projected construction-circle references. These were replaced with native FIX constraints at their existing positions; two valid projections and all mounting-hole geometry remain. Two unused sketches are now suppressed alongside their already-suppressed operations, in folders labeled Previous. Chamfer 4 had an unresolved edge selection; that empty selection was removed while retaining its working face selection, 1 mm distance and tangent propagation. The final feature list has no warning or error states; the existing Extrude 12 informational state remains.

The final five solid parts have exactly the same analytical face surfaces, areas, edge curves and geometry, and vertex coordinates as the pre-cleanup snapshot. Regenerated IDs and calculated face bounding boxes were excluded from this comparison. The Motor Spacer part ID regenerated, and both assembly instances resolve the new ID. All six active assembly instances sourced from this Part Studio resolve. `enclosure-cleanup-verification.json` records the comparison; `enclosure-organized.png` shows the final tree.

The saved Onshape version [Before housing cleanup](https://cad.onshape.com/documents/cc4111ace6f0da6f2cc5eff1/v/40b05c770cb0836268935bfd/e/b475005c11e8008d74903984) preserves the complete document before these edits. The cleanup can be reversed through Onshape history. Main and the source B2 workspace were not edited.
