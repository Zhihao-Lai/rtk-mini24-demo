# VGGT / RTK comparison gallery

Static GitHub Pages demo containing one or more image-only / RTK point-cloud comparison pairs.

Each pair contains:

1. A VGGT image-only reconstruction in the arbitrary VGGT frame.
2. The same VGGT geometry transformed into a local WGS84 ENU metric frame with RTK camera positions.

The RTK result is a global Sim(3) transform. It changes scale, orientation and world coordinates; it does not change local point-cloud shape.

Published input thumbnails are resized derivatives with EXIF/XMP metadata intentionally stripped.

Dataset sources, licenses and interpretation limits are listed in [ATTRIBUTION.md](ATTRIBUTION.md).
