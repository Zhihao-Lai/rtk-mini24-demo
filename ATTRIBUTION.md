# Dataset attribution

This site publishes metadata-stripped, resized image thumbnails and derived VGGT point clouds. It does not mirror the original image collections or precise camera-coordinate files.

## 3D Gaussian viewer

The interactive Gaussian scene uses [Spark 2.1.0](https://github.com/sparkjsdev/spark) and [Three.js r180](https://github.com/mrdoob/three.js), both under the MIT License. The corresponding license texts are redistributed in `vendor/LICENSE-Spark.txt` and `vendor/LICENSE-Three.txt`.

The displayed scene is a derived output of the official [TuojingAI/ReconDrive](https://github.com/TuojingAI/ReconDrive) Stage2 pipeline. The default web asset contains all 1,717,835 filtered Gaussians with position, anisotropic scale, rotation, DC color and opacity. The optional SH2 PLY keeps second-order spherical harmonics at quarter density; the lower image grid remains the reference for the full renderer output.

## DJI Terra RTK sample

The RTK Mini24 comparison uses images from the official [DJI Terra sample archive](https://terra-1-g.djicdn.com/6a83f01a46e9477d9af4727d9c4b9375/Terra/Sample%20File/Sample%20File.zip).

## Helenenschacht

The Helenenschacht comparison uses the Autel Evo II Pro RTK sample contributed by Daniel Dobosi and published by OpenDroneMap as [`odm_data_helenenschacht`](https://github.com/OpenDroneMap/odm_data_helenenschacht), commit `eece33e9ece2ff358a7bdc02e1db6f67925e00c4`, under [GPL-3.0](DATA_LICENSES/HELENENSCHACHT_GPL-3.0.txt).

## Gulpen pollinator field

The Gulpen comparison uses 83 original DJI Matrice 210 RTK photographs from Chieffallo et al., [“Machine learning for biodiversity: drone images to infer bee abundance”](https://zenodo.org/records/14793347). Every image used here reports DJI `RtkFlag=50`; the dataset is published under [CC BY 4.0](DATA_LICENSES/GULPEN_CC-BY-4.0.txt). Only metadata-stripped thumbnails and derived VGGT point clouds are redistributed by this site.

## TUM Downtown campus

The TUM Downtown comparison uses 45 consecutive original photographs from Anders et al., [“UAV Laser Scanning and Photogrammetry of TUM Downtown Campus”](https://doi.org/10.5281/zenodo.15282970), version 1.2.0. All 45 images used here report DJI `RtkFlag=50`; the acquisition documentation identifies SAPOS Bayern NTRIP as the real-time correction source. The dataset is published under [CC BY 4.0](DATA_LICENSES/TUM2TWIN_CC-BY-4.0.txt). Only metadata-stripped thumbnails and derived VGGT point clouds are redistributed by this site.

## Interpretation

“Image + RTK” means that a single global Sim(3) transform was fitted between VGGT camera centres and RTK camera-position priors. It restores metric scale, direction and position but does not inject RTK constraints into VGGT or bundle adjustment. Fit residuals are diagnostics, not independent geometric-accuracy measurements.

The Gulpen crop grid is intentionally retained as a difficult repeated-texture case. Its robust fit has 11 consistent camera centres out of 83, while the all-frame diagnostic residual is 41.28 m; this is evidence of global visual-trajectory inconsistency, not RTK measurement accuracy.

The TUM sequence has centimetre-level RTK metadata, but only 13 of 45 VGGT camera centres agree with one global Sim(3) within the 1 m RANSAC threshold. Its 2.46 m all-frame residual and 0.54 m inlier residual are trajectory-consistency diagnostics; they are not claims about point-cloud or RTK measurement accuracy.
