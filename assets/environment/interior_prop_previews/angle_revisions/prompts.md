# Angle-correction previews

Generated 2026-10-22 from the existing game cutouts. After user review, the four customs and bathhouse revisions were installed as game cutouts. The futon revision remains optional preview art; tenement futons use a small renderer rotation instead.

- `futon_angle_v2.png`: Preserve the indigo futon and pillow; adjust its long axis to the room wall/floor isometric diagonal.
- `inspection_table_angle_v2.png`: Preserve the dark cedar customs table and drawer; redraw the tabletop as a steeper isometric parallelogram aligned with the room grid.
- `customs_notice_board_angle_v2.png`: Preserve the wooden roof and blank notices; angle its long edges parallel to the room wall.
- `towel_shelf_angle_v2.png`: Preserve the towel shelf's contents; redraw its long shelf edges on the room's wall diagonal.
- `bath_bucket_stool_angle_v2.png`: Preserve the cedar water bucket and low stool; redraw their grouping and stool top in the room's isometric angle.

All five prompts requested one isolated prop, genuine alpha transparency, and no floor or shadows. The full-resolution files remain here as source art. `tools/prepare_interior_angle_revisions.py` prepares the four approved game cutouts and updates their metadata.
