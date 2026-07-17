# RTK Mini24: VGGT / RTK comparison

Static GitHub Pages demo containing exactly two point-cloud scenes:

1. VGGT image-only reconstruction in the arbitrary VGGT frame (Z axis visually corrected).
2. The same VGGT geometry transformed into a local WGS84 ENU metric frame with RTK FIX camera positions.

The RTK result is a global Sim(3) transform. It changes scale, orientation and world coordinates; it does not change local point-cloud shape.

The public input thumbnails are resized derivatives of the official DJI Terra sample images. EXIF/XMP metadata is intentionally stripped from the published JPEG files.

Source dataset: <https://terra-1-g.djicdn.com/6a83f01a46e9477d9af4727d9c4b9375/Terra/Sample%20File/Sample%20File.zip>
