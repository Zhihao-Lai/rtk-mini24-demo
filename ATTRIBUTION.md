# Dataset attribution

This site publishes metadata-stripped, resized image thumbnails and derived VGGT point clouds. It does not mirror the original image collections or precise camera-coordinate files.

## DJI Terra RTK sample

The RTK Mini24 comparison uses images from the official [DJI Terra sample archive](https://terra-1-g.djicdn.com/6a83f01a46e9477d9af4727d9c4b9375/Terra/Sample%20File/Sample%20File.zip).

## Helenenschacht

The Helenenschacht comparison uses the Autel Evo II Pro RTK sample contributed by Daniel Dobosi and published by OpenDroneMap as [`odm_data_helenenschacht`](https://github.com/OpenDroneMap/odm_data_helenenschacht), commit `eece33e9ece2ff358a7bdc02e1db6f67925e00c4`, under [GPL-3.0](DATA_LICENSES/HELENENSCHACHT_GPL-3.0.txt).

## Gulpen pollinator field

The Gulpen comparison uses 83 original DJI Matrice 210 RTK photographs from Chieffallo et al., [“Machine learning for biodiversity: drone images to infer bee abundance”](https://zenodo.org/records/14793347). Every image used here reports DJI `RtkFlag=50`; the dataset is published under [CC BY 4.0](DATA_LICENSES/GULPEN_CC-BY-4.0.txt). Only metadata-stripped thumbnails and derived VGGT point clouds are redistributed by this site.

## Interpretation

“Image + RTK/PPK” means that a single global Sim(3) transform was fitted between VGGT camera centres and GNSS camera-position priors. It restores metric scale, direction and position but does not inject GNSS constraints into VGGT or bundle adjustment. Fit residuals are diagnostics, not independent geometric-accuracy measurements.

The Gulpen crop grid is intentionally retained as a difficult repeated-texture case. Its robust fit has 11 consistent camera centres out of 83, while the all-frame diagnostic residual is 41.28 m; this is evidence of global visual-trajectory inconsistency, not RTK measurement accuracy.
