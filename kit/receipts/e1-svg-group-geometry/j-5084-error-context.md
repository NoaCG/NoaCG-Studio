# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor-groups.spec.ts >> SVG group anchor keys keep their stored frame while a member moves
- Location: e2e\editor-groups.spec.ts:397:1

# Error details

```
Error: #group-1 at 0: {"inline":"--noacg-group-x: 17.375; --noacg-group-y: -9.25; --noacg-group-rotation: 0; --noacg-group-scale-x: 3; --noacg-group-scale-y: 1; --base-anchor-x: 135.00049px; --base-anchor-y: 70px;","scale":"3"}

expect(received).toBeCloseTo(expected, precision)

Expected: 1
Received: 3

Expected precision:    3
Expected difference: < 0.0005
Received difference:   2
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e11]:
        - generic [ref=e12]: NoaCG
        - generic [ref=e13]: Studio
    - button "Home" [ref=e14] [cursor=pointer]
    - button "+ New graphic" [ref=e15] [cursor=pointer]
    - generic [ref=e16]: Imported SVG design
    - generic [ref=e17]: Editor Alpha
    - button "Assistant" [ref=e18] [cursor=pointer]
    - generic [ref=e19]:
      - generic [ref=e20]: ● Not saved
      - button "💾 Save" [ref=e21] [cursor=pointer]
      - button "▾" [ref=e22] [cursor=pointer]
  - generic [ref=e23]:
    - button "Project ▸" [ref=e24] [cursor=pointer]
    - generic [ref=e25]: Imported SVG design
    - generic [ref=e26]: Editing
    - navigation "Group breadcrumbs" [ref=e27]:
      - button "Composition" [ref=e28] [cursor=pointer]
  - generic [ref=e29]:
    - text: ▸
    - region "Graphic canvas" [ref=e30]:
      - generic [ref=e31]:
        - button "select tool" [pressed] [ref=e32] [cursor=pointer]: Select
        - button "anchor tool" [ref=e33] [cursor=pointer]: Anchor
        - button "text tool" [ref=e34] [cursor=pointer]: Text
        - button "rectangle tool" [ref=e35] [cursor=pointer]: Rectangle
        - button "ellipse tool" [ref=e36] [cursor=pointer]: Ellipse
        - button "pen tool" [ref=e37] [cursor=pointer]: Pen
        - button "image tool" [ref=e38] [cursor=pointer]: Image
        - button "Add image file…" [ref=e39] [cursor=pointer]
        - generic [ref=e40]: 1920 × 1080
        - combobox "Canvas zoom" [ref=e41] [cursor=pointer]:
          - option "50% of Fit"
          - option "Fit" [selected]
          - option "150% of Fit"
          - option "200% of Fit"
          - option "400% of Fit"
        - button "Fit" [ref=e42] [cursor=pointer]
      - generic "Arrange artwork" [ref=e43]:
        - generic [ref=e44]:
          - generic [ref=e45]:
            - text: Align to
            - combobox "Align to" [ref=e46] [cursor=pointer]:
              - option "Selection"
              - option "Canvas" [selected]
          - group "Align" [ref=e47]:
            - button "Align left" [ref=e48] [cursor=pointer]: Left
            - button "Align horizontal center" [ref=e49] [cursor=pointer]: Center
            - button "Align right" [ref=e50] [cursor=pointer]: Right
            - button "Align top" [ref=e51] [cursor=pointer]: Top
            - button "Align vertical center" [ref=e52] [cursor=pointer]: Middle
            - button "Align bottom" [ref=e53] [cursor=pointer]: Bottom
          - group "Distribute" [ref=e54]:
            - generic [ref=e55]: Gaps
            - button "Distribute horizontally" [disabled] [ref=e56]: Horizontal
            - button "Distribute vertically" [disabled] [ref=e57]: Vertical
          - generic [ref=e58]:
            - button "Group selection" [disabled] [ref=e59]: Group
            - button "Ungroup selection" [ref=e60] [cursor=pointer]: Ungroup
            - button "Enter group" [ref=e61] [cursor=pointer]: Edit group
      - generic "Canvas selection and pan" [ref=e62]:
        - generic:
          - iframe [ref=e63]:
            - img [ref=f2e4]:
              - generic [ref=f2e8]:
                - generic [ref=f2e9]: Alexandra Riva
                - generic [ref=f2e10]: Chief Correspondent
              - generic [ref=f2e12]: Helsinki 22:40
          - img
      - generic [ref=e64]:
        - generic [ref=e65]: 1 selected
        - generic [ref=e66]: "Arrows: move · Ctrl/Cmd+Arrows: resize · Shift: 10 px · Escape: cancel · Space: play/pause or drag to pan"
    - complementary "Inspector" [ref=e67]:
      - tablist "Inspector view" [ref=e68]:
        - tab "Properties" [selected] [ref=e69] [cursor=pointer]
        - tab "Outline" [ref=e70] [cursor=pointer]
      - generic [ref=e71]:
        - heading "Group 1" [level=2] [ref=e72]
        - generic [ref=e74]:
          - text: Opacity %
          - generic [ref=e75]:
            - button "Opacity % 100 +" [ref=e76] [cursor=pointer]: −
            - spinbutton "Opacity %" [ref=e77]: "100"
            - button "+" [ref=e78] [cursor=pointer]
        - generic [ref=e79]:
          - button "Enable Opacity animation" [ref=e80] [cursor=pointer]: ◷
          - button "Add Opacity key" [ref=e81] [cursor=pointer]: ◇
          - button "Previous Opacity key" [disabled] [ref=e82]: ‹
          - button "Next Opacity key" [disabled] [ref=e83]: ›
          - generic [ref=e84]: In start · base
        - paragraph [ref=e85]: Changes preview immediately. Enter or leave the field to finish; Escape cancels.
        - generic [ref=e86]:
          - generic [ref=e87]: Anchor point
          - generic [ref=e88]:
            - generic [ref=e89]:
              - generic [ref=e90]: Anchor X
              - textbox "Anchor X" [ref=e91]: "135"
            - generic [ref=e92]:
              - button "Disable Anchor X animation" [pressed] [ref=e93] [cursor=pointer]: ◷
              - button "Add Anchor X key" [ref=e94] [cursor=pointer]: ◇
              - button "Previous Anchor X key" [disabled] [ref=e95]: ‹
              - button "Next Anchor X key" [ref=e96] [cursor=pointer]: ›
              - generic [ref=e97]: In start · animated
          - generic [ref=e98]:
            - generic [ref=e99]:
              - generic [ref=e100]: Anchor Y
              - textbox "Anchor Y" [ref=e101]: "70"
            - generic [ref=e102]:
              - button "Disable Anchor Y animation" [pressed] [ref=e103] [cursor=pointer]: ◷
              - button "Add Anchor Y key" [ref=e104] [cursor=pointer]: ◇
              - button "Previous Anchor Y key" [disabled] [ref=e105]: ‹
              - button "Next Anchor Y key" [ref=e106] [cursor=pointer]: ›
              - generic [ref=e107]: In start · animated
          - button "Center anchor" [ref=e109] [cursor=pointer]
        - generic [ref=e110]:
          - generic [ref=e111]: Transform at playhead
          - generic [ref=e112]:
            - 'generic "Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel" [ref=e113]':
              - generic [ref=e114]: Position X
              - textbox "Position X" [ref=e115]: "17.375"
            - generic [ref=e116]:
              - button "Disable Position X animation" [pressed] [ref=e117] [cursor=pointer]: ◷
              - button "Remove Position X key" [pressed] [ref=e118] [cursor=pointer]: ◆
              - button "Previous Position X key" [disabled] [ref=e119]: ‹
              - button "Next Position X key" [disabled] [ref=e120]: ›
              - generic [ref=e121]: In start · key
          - generic [ref=e122]:
            - 'generic "Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel" [ref=e123]':
              - generic [ref=e124]: Position Y
              - textbox "Position Y" [ref=e125]: "-9.25"
            - generic [ref=e126]:
              - button "Disable Position Y animation" [pressed] [ref=e127] [cursor=pointer]: ◷
              - button "Remove Position Y key" [pressed] [ref=e128] [cursor=pointer]: ◆
              - button "Previous Position Y key" [disabled] [ref=e129]: ‹
              - button "Next Position Y key" [disabled] [ref=e130]: ›
              - generic [ref=e131]: In start · key
          - generic [ref=e132]:
            - 'generic "Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel" [ref=e133]':
              - generic [ref=e134]: Scale X %
              - textbox "Scale X %" [ref=e135]: "300"
            - generic [ref=e136]:
              - button "Disable Scale X animation" [pressed] [ref=e137] [cursor=pointer]: ◷
              - button "Remove Scale X key" [pressed] [ref=e138] [cursor=pointer]: ◆
              - button "Previous Scale X key" [disabled] [ref=e139]: ‹
              - button "Next Scale X key" [ref=e140] [cursor=pointer]: ›
              - generic [ref=e141]: In start · key
          - generic [ref=e142]:
            - 'generic "Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel" [ref=e143]':
              - generic [ref=e144]: Scale Y %
              - textbox "Scale Y %" [ref=e145]: "100"
            - generic [ref=e146]:
              - button "Disable Scale Y animation" [pressed] [ref=e147] [cursor=pointer]: ◷
              - button "Remove Scale Y key" [pressed] [ref=e148] [cursor=pointer]: ◆
              - button "Previous Scale Y key" [disabled] [ref=e149]: ‹
              - button "Next Scale Y key" [ref=e150] [cursor=pointer]: ›
              - generic [ref=e151]: In start · key
          - generic [ref=e152]:
            - 'generic "Drag horizontally · Shift: 10× · Ctrl/Cmd: 0.1× · Escape: cancel" [ref=e153]':
              - generic [ref=e154]: Rotation
              - textbox "Rotation" [ref=e155]: "0"
            - generic [ref=e156]:
              - button "Disable Rotation animation" [pressed] [ref=e157] [cursor=pointer]: ◷
              - button "Remove Rotation key" [pressed] [ref=e158] [cursor=pointer]: ◆
              - button "Previous Rotation key" [disabled] [ref=e159]: ‹
              - button "Next Rotation key" [ref=e160] [cursor=pointer]: ›
              - generic [ref=e161]: In start · key
        - generic [ref=e162]:
          - checkbox "Link proportions" [checked] [ref=e163] [cursor=pointer]
          - text: Link proportions
        - generic [ref=e164]:
          - button "Duplicate" [ref=e165] [cursor=pointer]
          - button "Delete" [ref=e166] [cursor=pointer]
          - button "Send backward" [ref=e167] [cursor=pointer]
          - button "Bring forward" [ref=e168] [cursor=pointer]
        - group [ref=e169]:
          - generic "Edit base values (preserve motion)" [ref=e170] [cursor=pointer]
        - generic [ref=e171]: Source layer
        - generic [ref=e172]:
          - term [ref=e173]: Element
          - definition [ref=e174]: g
          - term [ref=e175]: Selector
          - definition [ref=e176]:
            - code [ref=e177]: "#group-1"
          - term [ref=e178]: Kind
          - definition [ref=e179]: block
        - generic [ref=e180]: Animation
        - paragraph [ref=e181]: x, y, rotation, scaleX, scaleY, --base-anchor-x, --base-anchor-y
  - region "Timeline" [ref=e182]:
    - generic [ref=e183]:
      - strong [ref=e184]: Layers & Timeline
      - generic "Layer organization" [ref=e185]:
        - button "New layer folder" [ref=e186] [cursor=pointer]: + Folder
        - combobox "Move to layer folder" [ref=e187] [cursor=pointer]:
          - option "Move to folder…" [selected]
          - option "Loose layers"
      - generic [ref=e188]:
        - generic [ref=e189]: 0 keys
        - combobox "Key ease" [disabled] [ref=e190] [cursor=pointer]:
          - option "Select keys" [selected]
          - option "Linear"
          - option "Easy Ease In"
          - option "Easy Ease Out"
          - option "Easy Ease"
          - option "Bounce"
          - option "Overshoot"
          - option "Hold"
      - button "Undo" [ref=e191] [cursor=pointer]
      - button "Redo" [disabled] [ref=e192]
      - generic [ref=e193]: 25 fps
    - generic [ref=e194]:
      - button "Go to beginning" [ref=e195] [cursor=pointer]: "|◀"
      - button "Previous frame" [ref=e196] [cursor=pointer]: ‹|
      - button "Play" [ref=e197] [cursor=pointer]: ▶ Play
      - button "Next frame" [ref=e198] [cursor=pointer]: "|›"
      - status [ref=e199]: 0.00 s
      - generic [ref=e200]: 0 frames
      - button "Add Step at playhead" [ref=e202] [cursor=pointer]
      - generic [ref=e203]:
        - button "Out" [ref=e204] [cursor=pointer]
        - button "Set Out at playhead" [ref=e205] [cursor=pointer]
        - button "Edit Out" [ref=e206] [cursor=pointer]
      - generic [ref=e207]:
        - text: Ruler
        - combobox "Ruler units" [ref=e208] [cursor=pointer]:
          - option "Seconds" [selected]
          - option "Frames"
    - generic [ref=e209]:
      - generic [ref=e210]:
        - generic [ref=e211]: Layers
        - slider "Playhead" [active] [ref=e212]:
          - generic [ref=e213]: 0.00 s
          - generic [ref=e214]: 0.50 s
          - generic [ref=e215]: 1.00 s
          - generic [ref=e216]: 1.50 s
          - generic [ref=e217]: 2.00 s
          - generic [ref=e218]: In
          - button "Out flag" [ref=e219]: Out · hold
      - generic [ref=e221]:
        - generic [ref=e222]:
          - button "Properties of Whole graphic" [ref=e223] [cursor=pointer]: ▸
          - button "Hide Whole graphic layer" [pressed] [ref=e224] [cursor=pointer]:
            - img [ref=e225]
          - button "01 ◇ Whole graphic" [ref=e228] [cursor=pointer]:
            - generic [ref=e229]: "01"
            - generic [ref=e230]: ◇
            - generic [ref=e231]: Whole graphic
        - generic [ref=e232]:
          - button "Move Whole graphic span" [ref=e233]: Whole graphic
          - button "Trim start Whole graphic span" [ref=e234]
          - button "Trim end Whole graphic span" [ref=e235]
          - button "Move Whole graphic span" [ref=e236]: Whole graphic
          - button "Trim start Whole graphic span" [ref=e237]
          - button "Trim end Whole graphic span" [ref=e238]
      - generic [ref=e240]:
        - generic [ref=e241]:
          - button "Properties of Design" [ref=e242] [cursor=pointer]: ▸
          - button "Hide Design layer" [pressed] [ref=e243] [cursor=pointer]:
            - img [ref=e244]
          - button "02 ◇ Design" [ref=e247] [cursor=pointer]:
            - generic [ref=e248]: "02"
            - generic [ref=e249]: ◇
            - generic [ref=e250]: Design
        - generic [ref=e251]:
          - button "Move Design span" [ref=e252]: Design
          - button "Trim start Design span" [ref=e253]
          - button "Trim end Design span" [ref=e254]
          - button "Move Design span" [ref=e255]: Design
          - button "Trim start Design span" [ref=e256]
          - button "Trim end Design span" [ref=e257]
          - 'button "Design: Opacity key at 0.00 s" [ref=e258]': ◆
          - 'button "Design: Opacity keys at 0.80 s" [ref=e259]': ◆
          - 'button "Design: Opacity key at 1.25 s" [ref=e260]': ◆
      - generic [ref=e262]:
        - generic [ref=e263]:
          - button "Properties of Artwork" [ref=e264] [cursor=pointer]: ▸
          - button "Hide Artwork layer" [pressed] [ref=e265] [cursor=pointer]:
            - img [ref=e266]
          - button "03 ▧ Artwork" [ref=e269] [cursor=pointer]:
            - generic [ref=e270]: "03"
            - generic [ref=e271]: ▧
            - generic [ref=e272]: Artwork
        - generic [ref=e273]:
          - button "Move Artwork span" [ref=e274]: Artwork
          - button "Trim start Artwork span" [ref=e275]
          - button "Trim end Artwork span" [ref=e276]
          - button "Move Artwork span" [ref=e277]: Artwork
          - button "Trim start Artwork span" [ref=e278]
          - button "Trim end Artwork span" [ref=e279]
      - generic [ref=e281]:
        - generic [ref=e282]:
          - button "Properties of Backplate" [ref=e283] [cursor=pointer]: ▸
          - button "Hide Backplate layer" [pressed] [ref=e284] [cursor=pointer]:
            - img [ref=e285]
          - button "04 ◇ Backplate" [ref=e288] [cursor=pointer]:
            - generic [ref=e289]: "04"
            - generic [ref=e290]: ◇
            - generic [ref=e291]: Backplate
        - generic [ref=e292]:
          - button "Move Backplate span" [ref=e293]: Backplate
          - button "Trim start Backplate span" [ref=e294]
          - button "Trim end Backplate span" [ref=e295]
          - button "Move Backplate span" [ref=e296]: Backplate
          - button "Trim start Backplate span" [ref=e297]
          - button "Trim end Backplate span" [ref=e298]
      - generic [ref=e300]:
        - generic [ref=e301]:
          - button "Properties of Rect" [ref=e302] [cursor=pointer]: ▸
          - button "Hide Rect layer" [pressed] [ref=e303] [cursor=pointer]:
            - img [ref=e304]
          - button "05 ◇ Rect" [ref=e307] [cursor=pointer]:
            - generic [ref=e308]: "05"
            - generic [ref=e309]: ◇
            - generic [ref=e310]: Rect
        - generic [ref=e311]:
          - button "Move Rect span" [ref=e312]: Rect
          - button "Trim start Rect span" [ref=e313]
          - button "Trim end Rect span" [ref=e314]
          - button "Move Rect span" [ref=e315]: Rect
          - button "Trim start Rect span" [ref=e316]
          - button "Trim end Rect span" [ref=e317]
      - generic [ref=e319]:
        - generic [ref=e320]:
          - button "Properties of Rect" [ref=e321] [cursor=pointer]: ▸
          - button "Hide Rect layer" [pressed] [ref=e322] [cursor=pointer]:
            - img [ref=e323]
          - button "06 ◇ Rect" [ref=e326] [cursor=pointer]:
            - generic [ref=e327]: "06"
            - generic [ref=e328]: ◇
            - generic [ref=e329]: Rect
        - generic [ref=e330]:
          - button "Move Rect span" [ref=e331]: Rect
          - button "Trim start Rect span" [ref=e332]
          - button "Trim end Rect span" [ref=e333]
          - button "Move Rect span" [ref=e334]: Rect
          - button "Trim start Rect span" [ref=e335]
          - button "Trim end Rect span" [ref=e336]
      - generic [ref=e338]:
        - generic [ref=e339]:
          - button "Properties of Text Layer" [ref=e340] [cursor=pointer]: ▸
          - button "Hide Text Layer layer" [pressed] [ref=e341] [cursor=pointer]:
            - img [ref=e342]
          - button "07 ◇ Text Layer" [ref=e345] [cursor=pointer]:
            - generic [ref=e346]: "07"
            - generic [ref=e347]: ◇
            - generic [ref=e348]: Text Layer
        - generic [ref=e349]:
          - button "Move Text Layer span" [ref=e350]: Text Layer
          - button "Trim start Text Layer span" [ref=e351]
          - button "Trim end Text Layer span" [ref=e352]
          - button "Move Text Layer span" [ref=e353]: Text Layer
          - button "Trim start Text Layer span" [ref=e354]
          - button "Trim end Text Layer span" [ref=e355]
      - generic [ref=e357]:
        - generic [ref=e358]:
          - button "Properties of Name" [ref=e359] [cursor=pointer]: ▸
          - button "Hide Name layer" [pressed] [ref=e360] [cursor=pointer]:
            - img [ref=e361]
          - button "08 T Name" [ref=e364] [cursor=pointer]:
            - generic [ref=e365]: "08"
            - generic [ref=e366]: T
            - generic [ref=e367]: Name
        - generic [ref=e368]:
          - button "Move Name span" [ref=e369]: Name
          - button "Trim start Name span" [ref=e370]
          - button "Trim end Name span" [ref=e371]
          - button "Move Name span" [ref=e372]: Name
          - button "Trim start Name span" [ref=e373]
          - button "Trim end Name span" [ref=e374]
      - generic [ref=e376]:
        - generic [ref=e377]:
          - button "Properties of Title" [ref=e378] [cursor=pointer]: ▸
          - button "Hide Title layer" [pressed] [ref=e379] [cursor=pointer]:
            - img [ref=e380]
          - button "09 T Title" [ref=e383] [cursor=pointer]:
            - generic [ref=e384]: "09"
            - generic [ref=e385]: T
            - generic [ref=e386]: Title
        - generic [ref=e387]:
          - button "Move Title span" [ref=e388]: Title
          - button "Trim start Title span" [ref=e389]
          - button "Trim end Title span" [ref=e390]
          - button "Move Title span" [ref=e391]: Title
          - button "Trim start Title span" [ref=e392]
          - button "Trim end Title span" [ref=e393]
      - generic [ref=e395]:
        - generic [ref=e396]:
          - button "Properties of Text Layer" [ref=e397] [cursor=pointer]: ▸
          - button "Hide Text Layer layer" [pressed] [ref=e398] [cursor=pointer]:
            - img [ref=e399]
          - button "10 ◇ Text Layer" [ref=e402] [cursor=pointer]:
            - generic [ref=e403]: "10"
            - generic [ref=e404]: ◇
            - generic [ref=e405]: Text Layer
        - generic [ref=e406]:
          - button "Move Text Layer span" [ref=e407]: Text Layer
          - button "Trim start Text Layer span" [ref=e408]
          - button "Trim end Text Layer span" [ref=e409]
          - button "Move Text Layer span" [ref=e410]: Text Layer
          - button "Trim start Text Layer span" [ref=e411]
          - button "Trim end Text Layer span" [ref=e412]
      - generic [ref=e414]:
        - generic [ref=e415]:
          - button "Properties of Text" [ref=e416] [cursor=pointer]: ▸
          - button "Hide Text layer" [pressed] [ref=e417] [cursor=pointer]:
            - img [ref=e418]
          - button "11 T Text" [ref=e421] [cursor=pointer]:
            - generic [ref=e422]: "11"
            - generic [ref=e423]: T
            - generic [ref=e424]: Text
        - generic [ref=e425]:
          - button "Move Text span" [ref=e426]: Text
          - button "Trim start Text span" [ref=e427]
          - button "Trim end Text span" [ref=e428]
          - button "Move Text span" [ref=e429]: Text
          - button "Trim start Text span" [ref=e430]
          - button "Trim end Text span" [ref=e431]
      - generic [ref=e433]:
        - generic [ref=e434]:
          - button "Properties of Location" [ref=e435] [cursor=pointer]: ▸
          - button "Hide Location layer" [pressed] [ref=e436] [cursor=pointer]:
            - img [ref=e437]
          - button "12 T Location" [ref=e440] [cursor=pointer]:
            - generic [ref=e441]: "12"
            - generic [ref=e442]: T
            - generic [ref=e443]: Location
        - generic [ref=e444]:
          - button "Move Location span" [ref=e445]: Location
          - button "Trim start Location span" [ref=e446]
          - button "Trim end Location span" [ref=e447]
          - button "Move Location span" [ref=e448]: Location
          - button "Trim start Location span" [ref=e449]
          - button "Trim end Location span" [ref=e450]
      - generic [ref=e452]:
        - generic [ref=e453]:
          - button "Properties of Text Layer" [ref=e454] [cursor=pointer]: ▸
          - button "Hide Text Layer layer" [pressed] [ref=e455] [cursor=pointer]:
            - img [ref=e456]
          - button "13 T Text Layer" [ref=e459] [cursor=pointer]:
            - generic [ref=e460]: "13"
            - generic [ref=e461]: T
            - generic [ref=e462]: Text Layer
        - generic [ref=e463]:
          - button "Move Text Layer span" [ref=e464]: Text Layer
          - button "Trim start Text Layer span" [ref=e465]
          - button "Trim end Text Layer span" [ref=e466]
          - button "Move Text Layer span" [ref=e467]: Text Layer
          - button "Trim start Text Layer span" [ref=e468]
          - button "Trim end Text Layer span" [ref=e469]
      - generic [ref=e471]:
        - generic [ref=e472]:
          - button "Properties of Crest" [ref=e473] [cursor=pointer]: ▸
          - button "Hide Crest layer" [pressed] [ref=e474] [cursor=pointer]:
            - img [ref=e475]
          - button "14 ▧ Crest" [ref=e478] [cursor=pointer]:
            - generic [ref=e479]: "14"
            - generic [ref=e480]: ▧
            - generic [ref=e481]: Crest
        - generic [ref=e482]:
          - button "Move Crest span" [ref=e483]: Crest
          - button "Trim start Crest span" [ref=e484]
          - button "Trim end Crest span" [ref=e485]
          - button "Move Crest span" [ref=e486]: Crest
          - button "Trim start Crest span" [ref=e487]
          - button "Trim end Crest span" [ref=e488]
      - generic [ref=e490]:
        - generic [ref=e491]:
          - button "Properties of pivot-parent" [ref=e492] [cursor=pointer]: ▸
          - button "Hide pivot-parent layer" [pressed] [ref=e493] [cursor=pointer]:
            - img [ref=e494]
          - button "15 ◇ pivot-parent" [ref=e497] [cursor=pointer]:
            - generic [ref=e498]: "15"
            - generic [ref=e499]: ◇
            - generic [ref=e500]: pivot-parent
        - generic [ref=e501]:
          - button "Move pivot-parent span" [ref=e502]: pivot-parent
          - button "Trim start pivot-parent span" [ref=e503]
          - button "Trim end pivot-parent span" [ref=e504]
          - button "Move pivot-parent span" [ref=e505]: pivot-parent
          - button "Trim start pivot-parent span" [ref=e506]
          - button "Trim end pivot-parent span" [ref=e507]
      - generic [ref=e509]:
        - generic [ref=e510]:
          - button "Properties of Group 1" [ref=e511] [cursor=pointer]: ▸
          - button "Hide Group 1 layer" [pressed] [ref=e512] [cursor=pointer]:
            - img [ref=e513]
          - button "16 ▣ Group 1" [pressed] [ref=e516] [cursor=pointer]:
            - generic [ref=e517]: "16"
            - generic [ref=e518]: ▣
            - generic [ref=e519]: Group 1
          - generic [ref=e520]: Group
          - button "Edit Group 1" [ref=e521] [cursor=pointer]: ↳
        - generic [ref=e522]:
          - button "Move Group 1 span" [ref=e523]: Group 1
          - button "Trim start Group 1 span" [ref=e524]
          - button "Trim end Group 1 span" [ref=e525]
          - button "Move Group 1 span" [ref=e526]: Group 1
          - button "Trim start Group 1 span" [ref=e527]
          - button "Trim end Group 1 span" [ref=e528]
          - 'button "Group 1: X, Y, Rotation, Scale X, Scale Y keys at 0.00 s" [ref=e529]': ◆
          - 'button "Group 1: Rotation, Scale X, Scale Y, Anchor X, Anchor Y keys at 0.40 s" [ref=e530]': ◆
          - 'button "Group 1: Scale X, Anchor X keys at 0.20 s" [ref=e531]': ◆
          - 'button "Group 1: Anchor Y key at 0.60 s" [ref=e532]': ◆
    - generic [ref=e533]:
      - generic [ref=e534]: "Space: play/pause · Arrows: frame · Escape: cancel"
      - generic [ref=e535]: "Body: move keys · Edges: trim visibility · Key: drag or arrows to move · Alt: bypass snap · Drag empty lane: select keys · Right-click key: ease · Flag: drag, double-click to rename"
  - generic [ref=e536]:
    - generic [ref=e537]: Artwork editing · Alpha
    - generic [ref=e538]: "Stopwatch: animate · Diamond: key at playhead"
```

# Test source

```ts
  404 |     data.steps[0].ease = 'none';
  405 |     const members = '<g id="pivot-parent" transform="translate(100 80) rotate(30) scale(2 1.5)"><rect id="pivot-a" x="180" y="90" width="90" height="60" fill="orange"/><path id="pivot-b" d="M370 170 L450 170 L420 230 Z" fill="red"/></g>';
  406 |     const html = store.template.html.replace('viewBox="0 0 960 270"', 'viewBox="35 24 960 270"').replace('</svg>', members + '</svg>');
  407 |     store.applyTemplate({ ...store.template, js: replaceRegionWithAnimData(store.template.js, data)!, html });
  408 |   });
  409 |   await ready(page);
  410 |   const members = ['#pivot-a', '#pivot-b'];
  411 |   const painted = async () => {
  412 |     await expect.poll(() => evaluateInPage(page, async () => {
  413 |       const controller = (await import('/src/components/editorFoundation/Canvas.tsx')).foundationDiagnostics();
  414 |       const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
  415 |       return controller?.receipt(session.version(), session.port.view()).state;
  416 |     })).toBe('ready');
  417 |   };
  418 |   const scrub = async (time: number) => { await seek(page, time); await painted(); };
  419 |   await painted();
  420 |   const beforeGroup = await rects(page, members), id = await group(page, members);
  421 |   await painted();
  422 |   nearRects(await rects(page, members), beforeGroup);
  423 |   const iframe = page.frameLocator('iframe[title="Foundation graphic preview"]');
  424 |   const matrix = async (selector: string) => iframe.locator(selector).evaluate(el => {
  425 |     const node = el as SVGGraphicsElement;
  426 |     const ancestor = document.getElementById('pivot-parent') as unknown as SVGGraphicsElement;
  427 |     const m = ancestor.getScreenCTM()!.inverse().multiply(node.getScreenCTM()!);
  428 |     return [m.a, m.b, m.c, m.d, m.e, m.f];
  429 |   });
  430 |   const poses = () => Promise.all(members.map(matrix));
  431 |   const samePose = (actual: number[][], expected: number[][], stage: string) => {
  432 |     actual.forEach((m, layer) => m.forEach((value, component) => expect(value, `${stage}, member ${layer}`).toBeCloseTo(expected[layer][component], 3)));
  433 |   };
  434 |   await expect(iframe.locator(id)).toHaveAttribute('data-noacg-group-pivot', 'frame-v1');
  435 |   await evaluateInPage(page, async selector => {
  436 |     const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
  437 |     s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(),
  438 |       operations: [{ kind: 'base.set', selector, values: { anchorX: 135.00049, anchorY: 70 } }] });
  439 |   }, id);
  440 |   await ready(page);
  441 |   await key(page, members[0], 'x', 0, 0);
  442 |   await key(page, members[0], 'x', .4, -80);
  443 |   await key(page, id, 'x', 0, 17.375);
  444 |   await key(page, id, 'y', 0, -9.25);
  445 |   for (const [property, first, last] of [['rotation', 0, 35], ['scaleX', 1, 1.4], ['scaleY', 1, .8]] as const) {
  446 |     await key(page, id, property, 0, first);
  447 |     await key(page, id, property, .4, last);
  448 |   }
  449 |   await key(page, id, 'scaleX', .2, 3);
  450 |   await select(page, [id]);
  451 |   await scrub(.2);
  452 |   const first = await poses(), original = await source(page);
  453 |   expect(await iframe.locator(id).getAttribute('transform')).toBeNull();
  454 |   const history = () => evaluateInPage(page, async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length);
  455 |   const entries = await history();
  456 |   await page.getByRole('button', { name: 'Enable Anchor X animation', exact: true }).click();
  457 |   await ready(page);
  458 |   await painted();
  459 |   samePose(await poses(), first, 'fractional first enable');
  460 |   expect(await iframe.locator(id).getAttribute('transform')).toBeNull();
  461 |   expect(await history()).toBe(entries + 1);
  462 |   const put = async (axis: 'X' | 'Y', value: number) => {
  463 |     const field = page.getByRole('textbox', { name: 'Anchor ' + axis, exact: true });
  464 |     await field.fill(String(value));
  465 |     await field.press('Enter');
  466 |     await ready(page);
  467 |     await expect(page.locator('.ef-anchor').getByRole('alert')).toHaveCount(0);
  468 |     await expect(field).toHaveValue(String(value));
  469 |     await expect(page.getByRole('button', { name: 'Remove Anchor ' + axis + ' key', exact: true })).toBeVisible();
  470 |   };
  471 |   await scrub(.4);
  472 |   await put('X', 95);
  473 |   await page.getByRole('button', { name: 'Enable Anchor Y animation', exact: true }).click();
  474 |   await ready(page);
  475 |   await scrub(.6);
  476 |   await put('Y', 95);
  477 |   const authored = await source(page);
  478 |   expect(authored.html).toBe(original.html);
  479 |   expect(authored.css).toBe(original.css);
  480 |   expect(authored.fields).toEqual(original.fields);
  481 |   const data = await evaluateInPage(page, async ({ prior, edited, id }) => {
  482 |     const { parseAnimData } = await import('/src/blocks/animData.ts');
  483 |     const { SVG_GROUP_PIVOT_UNITS } = await import('/src/model/svgGroupTransform.ts');
  484 |     const before = parseAnimData(prior)!, after = parseAnimData(edited)!;
  485 |     const axes = ['--base-anchor-x', '--base-anchor-y'];
  486 |     const pivot = Object.fromEntries(axes.map(axis => [axis, after.steps[0].layers[id][axis].map(key => ({ ...key, value: Number(key.value) / SVG_GROUP_PIVOT_UNITS }))]));
  487 |     for (const step of after.steps) if (step.layers[id]) for (const axis of axes) delete step.layers[id][axis];
  488 |     return { before, after, pivot };
  489 |   }, { prior: original.js, edited: authored.js, id });
  490 |   expect(data.after).toEqual(data.before);
  491 |   expect(data.pivot).toEqual({ '--base-anchor-x': [{ time: .2, value: 135.00049 }, { time: .4, value: 95 }], '--base-anchor-y': [{ time: .4, value: 70 }, { time: .6, value: 95 }] });
  492 |   expect(data.before.steps[0].layers[id].scaleX).toEqual([{ time: 0, value: 1 }, { time: .2, value: 3 }, { time: .4, value: 1.4 }]);
  493 |   for (const [time, pivotX, pivotY, moved, degrees, scaleX, scaleY] of [
  494 |     [0, 315, 160, 0, 0, 1, 1], [.4, 275, 160, -80, 35, 1.4, .8],
  495 |     [.6, 275, 185, -80, 35, 1.4, .8], [.4, 275, 160, -80, 35, 1.4, .8],
  496 |   ]) {
  497 |     await scrub(time);
  498 |     const style = await iframe.locator(id).evaluate(el => ({ inline: el.getAttribute('style'), scale: getComputedStyle(el).getPropertyValue('--noacg-group-scale-x') }));
  499 |     const angle = degrees * Math.PI / 180;
  500 |     const a = Math.cos(angle) * scaleX, b = Math.sin(angle) * scaleX;
  501 |     const c = -Math.sin(angle) * scaleY, d = Math.cos(angle) * scaleY;
  502 |     const e = 17.375 + pivotX - a * pivotX - c * pivotY, f = -9.25 + pivotY - b * pivotX - d * pivotY;
  503 |     for (const [selector, expected] of [[id, [a, b, c, d, e, f]], [members[0], [a, b, c, d, e + a * moved, f + b * moved]], [members[1], [a, b, c, d, e, f]]] as const) {
> 504 |       for (const [index, value] of (await matrix(selector)).entries()) expect(value, `${selector} at ${time}: ${JSON.stringify(style)}`).toBeCloseTo(expected[index], 3);
      |                                                                                                                                          ^ Error: #group-1 at 0: {"inline":"--noacg-group-x: 17.375; --noacg-group-y: -9.25; --noacg-group-rotation: 0; --noacg-group-scale-x: 3; --noacg-group-scale-y: 1; --base-anchor-x: 135.00049px; --base-anchor-y: 70px;","scale":"3"}
  505 |     }
  506 |     const marker = (await page.locator('.ef-selection [data-anchor]').getAttribute('transform'))!.match(/-?[\d.]+/g)!.map(Number);
  507 |     const projected = await iframe.locator(id).evaluate((el, p) => {
  508 |       const point = new DOMPoint(p[0], p[1]).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);
  509 |       return [point.x, point.y];
  510 |     }, [time === 0 ? 315.00049 : pivotX, pivotY]);
  511 |     marker.forEach((value, index) => expect(Math.abs(value - projected[index])).toBeLessThan(.01));
  512 |   }
  513 |   const beforeRefusal = await history();
  514 |   await page.getByRole('button', { name: 'Ungroup selection', exact: true }).click();
  515 |   await expect(page.locator('.ef-group-error')).toContainText('animates its pivot');
  516 |   expect(await source(page)).toEqual(authored);
  517 |   expect(await history()).toBe(beforeRefusal);
  518 |   expect(await evaluateInPage(page, async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual([id]);
  519 | 
  520 |   for (const [axis, time] of [['X', .32], ['Y', .52]] as const) {
  521 |     await scrub(time);
  522 |     const prior = await poses();
  523 |     await page.getByRole('button', { name: 'Disable Anchor ' + axis + ' animation', exact: true }).click();
  524 |     await ready(page); await painted();
  525 |     samePose(await poses(), prior, 'baked Anchor ' + axis);
  526 |   }
  527 |   const baked = await poses();
  528 |   await page.getByRole('button', { name: 'Ungroup selection', exact: true }).click();
  529 |   await ready(page); await painted();
  530 |   samePose(await poses(), baked, 'ungroup after bake');
  531 |   await expect(iframe.locator('g[data-noacg-carrier][data-noacg-group-pivot="frame-v1"]')).toHaveCount(1);
  532 | });
  533 | 
  534 | test('local parent trim keeps child motion and navigation cancels timeline drafts',async({page})=>{
  535 |   await open(page);const ids=await create(page),id=await group(page,ids.slice(0,2));
  536 |   await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);
  537 |   const prior=await source(page),parse=async(t:Awaited<ReturnType<typeof source>>)=>evaluateInPage(page, async js=>(await import('/src/blocks/animData.ts')).parseAnimData(js),t.js);
  538 |   await page.getByRole('button',{name:'Enter group',exact:true}).click();
  539 |   const trim=page.getByTestId('foundation-parent-bar').getByRole('button',{name:'Trim start Group 1 span',exact:true}).first();
  540 |   await trim.focus();await trim.press('ArrowRight');await ready(page);
  541 |   const trimmed=await parse(await source(page)),original=await parse(prior);
  542 |   expect(trimmed!.steps[0].layers[ids[0]]).toEqual(original!.steps[0].layers[ids[0]]);
  543 |   expect(trimmed!.steps.map(s=>[s.name,s.duration])).toEqual(original!.steps.map(s=>[s.name,s.duration]));
  544 |   expect(trimmed!.steps[0].spans![id][0].start).toBeCloseTo(.04,5);
  545 |   await undo(page);expect(await source(page)).toEqual(prior);
  546 |   const begin=async(locator:ReturnType<typeof page.locator>)=>{const r=(await locator.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+30,r.y+r.height/2,{steps:4});};
  547 |   const back=page.getByRole('navigation',{name:'Group breadcrumbs'}).getByRole('button',{name:'Composition',exact:true});
  548 |   await begin(page.getByTestId('foundation-parent-bar').getByRole('button',{name:'Move Group 1 span',exact:true}).first());
  549 |   await back.evaluate(el=>(el as HTMLButtonElement).click());await page.mouse.up();await ready(page);expect(await source(page)).toEqual(prior);
  550 |   await select(page,[id]);await page.getByRole('button',{name:'Enter group',exact:true}).click();
  551 |   await begin(page.locator('.ef-track[data-selector="'+ids[0]+'"] .ef-timeline-key').first());
  552 |   await back.evaluate(el=>(el as HTMLButtonElement).click());await page.mouse.up();await ready(page);expect(await source(page)).toEqual(prior);
  553 |   await expect(page.getByText('0 keys',{exact:true})).toBeVisible();
  554 | });
  555 | 
  556 | test('grouping existing SVG member motion refuses exactly beside its control',async({page})=>{
  557 |   await open(page,'svg');
  558 |   await evaluateInPage(page, async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="guard-a" x="180" y="90" width="90" height="60" fill="orange"/><rect id="guard-b" x="370" y="170" width="80" height="60" fill="red"/></svg>')});});await ready(page);
  559 |   const ids=['#guard-a','#guard-b'];await key(page,ids[0],'x',0,0);await key(page,ids[0],'x',.4,44);await select(page,ids);
  560 |   const before=await source(page);await page.getByRole('button',{name:'Group selection',exact:true}).click();
  561 |   await expect(page.locator('.ef-group-error')).toContainText('before authoring their motion');expect(await source(page)).toEqual(before);
  562 |   expect(await evaluateInPage(page, async()=>(await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts)).toEqual(ids);
  563 | });
  564 | 
  565 | test('SVG parent movement retains only owned static pivots and anchor refuses unknown data',async({page})=>{
  566 |   await open(page,'svg');
  567 |   await evaluateInPage(page, async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="time-a" x="180" y="90" width="90" height="60" fill="orange"/><rect id="time-b" x="370" y="170" width="80" height="60" fill="red"/></svg>')});});await ready(page);
  568 |   const id=await group(page,['#time-a','#time-b']);
  569 |   await evaluateInPage(page, async()=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),{parseAnimData,locateAnimData}=await import('/src/blocks/animData.ts');const data=parseAnimData(store.template.js)!;for(const step of data.steps)step.layers['#time-a']={transformOrigin:[{time:0,value:'10px 10px'}]};const at=locateAnimData(store.template.js)!;store.applyTemplate({...store.template,js:store.template.js.slice(0,at.start)+JSON.stringify(data)+store.template.js.slice(at.end)});});await ready(page);
  570 |   await evaluateInPage(page, async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'group.move',selector:id,step:0,delta:.4}]});},id);await ready(page);
  571 |   const moved=await evaluateInPage(page, async js=>(await import('/src/blocks/animData.ts')).parseAnimData(js),(await source(page)).js);
  572 |   expect(moved!.steps[0].layers[id].transformOrigin[0].time).toBe(0);expect(moved!.steps[0].layers['#time-a'].transformOrigin[0].time).toBe(.4);
  573 |   await evaluateInPage(page, async()=>{const store=(await import('/src/store/templateStore.ts')).useTemplateStore.getState(),{locateAnimData}=await import('/src/blocks/animData.ts');const at=locateAnimData(store.template.js)!,data=JSON.parse(store.template.js.slice(at.start,at.end));data.futureGroupMetadata={keep:'exact'};store.applyTemplate({...store.template,js:store.template.js.slice(0,at.start)+JSON.stringify(data)+store.template.js.slice(at.end)});});await ready(page);
  574 |   const before=await source(page);
  575 |   const error=await evaluateInPage(page, async id=>{const s=(await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();try{s.execute({documentId:s.documentId,expected:s.version(),transactionId:crypto.randomUUID(),operations:[{kind:'base.set',selector:id,values:{anchorX:100,anchorY:40}}]});return '';}catch(e){return String(e);}},id);
  576 |   expect(error).toContain('pivot initializer');expect(await source(page)).toEqual(before);
  577 | });
  578 | 
  579 | test('new wrapper inheritance refuses without changing member paint',async({page})=>{
  580 |   await open(page,'svg');
  581 |   await evaluateInPage(page, async()=>{const s=(await import('/src/store/templateStore.ts')).useTemplateStore.getState();s.applyTemplate({...s.template,html:s.template.html.replace('</svg>','<rect id="inherit-a" x="180" y="90" width="90" height="60" fill="currentColor"/><rect id="inherit-b" x="370" y="170" width="80" height="60" fill="currentColor"/></svg>'),css:s.template.css+'\ng {color:#ff0000;}'});});await ready(page);
  582 |   const ids=['#inherit-a','#inherit-b'];await select(page,ids);const before=await source(page);
  583 |   const frame=(await(await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  584 |   const color=await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill);
  585 |   await page.getByRole('button',{name:'Group selection',exact:true}).click();await ready(page);
  586 |   expect(await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill)).toBe(color);
  587 |   await expect(page.locator('.ef-group-error')).toContainText('would style the new group');expect(await source(page)).toEqual(before);
  588 |   expect(await frame.locator(ids[0]).evaluate(el=>getComputedStyle(el).fill)).toBe(color);
  589 | });
  590 | 
  591 | 
  592 | test('new wrapper dynamic selector refuses without changing source',async({page})=>{
  593 |   await open(page);const ids=await create(page),before=await source(page);
  594 |   const result=await evaluateInPage(page, async({before,ids})=>{
  595 |     const {locateAnimData}=await import('/src/blocks/animData.ts'),{applyOperations}=await import('/src/components/editorFoundation/operations.ts');
  596 |     const at=locateAnimData(before.js)!,data=JSON.parse(before.js.slice(at.start,at.end));
  597 |     data.steps[0].dynamics=[{time:0,build:'groupProbe',target:'div'}];
  598 |     const input={...before,js:before.js.slice(0,at.start)+JSON.stringify(data)+before.js.slice(at.end)},original=JSON.stringify(input);
  599 |     let error='';try{applyOperations(input,[{kind:'group.create',selectors:ids.slice(0,2),box:{x:220,y:-390,width:280,height:110}}]);}catch(e){error=String(e);}
  600 |     return{error,unchanged:JSON.stringify(input)===original};
  601 |   },{before,ids});
  602 |   expect(result.error).toContain('source animation selector');expect(result.unchanged).toBe(true);expect(await source(page)).toEqual(before);
  603 | });
  604 | 
```