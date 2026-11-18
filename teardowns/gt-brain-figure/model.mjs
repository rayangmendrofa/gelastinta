// Every number the figure shows, and where it comes from.
// Source: Griffa G, Palombo M, Yeffal A, Lee H-H, Solano A, Huang SY, Della-Maggiore V (2026)
// "Learning engages transient and sustained cellular mechanisms in the human brain",
// PLoS Biol 24(6): e3003861, doi:10.1371/journal.pbio.3003861, CC BY 4.0.
//
// Values are group means read off the bar charts of the paper's Fig 3 (MD in units of 1e-4 as printed,
// the three SANDI fractions as fractions of the signal). Reading a bar chart by eye is good to about
// +/- 0.002 for the fractions and +/- 0.03 for MD, so treat the third decimal as approximate.
// The exact numbers are in the authors' Zenodo record (doi:10.5281/zenodo.20527091).
// Significance labels are the paper's (repeated measures ANOVA, Bonferroni corrected).

export const TIMES = ["baseline", "30 min", "24 h"];

export const REGIONS = [
  {
    key: "hip", name: "Hippocampus", short: "hippocampus", side: "left",
    md: [8.81, 8.65, 8.89], soma: [0.366, 0.380, 0.363], neurite: [0.191, 0.191, 0.190], extra: [0.434, 0.421, 0.439],
    sig: { md: "p < 0.05", soma: "p = 0.016", neurite: "ns", extra: "p < 0.05" },
    story: "Transient: cell bodies swell at 30 min and are back by 24 h. Cell processes do not change.",
  },
  {
    key: "m1", name: "Primary motor cortex", short: "M1", side: "left",
    md: [7.42, 7.10, 7.36], soma: [0.384, 0.393, 0.378], neurite: [0.263, 0.264, 0.269], extra: [0.341, 0.331, 0.340],
    sig: { md: "p < 0.05", soma: "p < 0.001", neurite: "ns", extra: "p < 0.05" },
    story: "Transient: the strongest cell body swelling of the four, gone by 24 h. The small neurite rise is not significant.",
  },
  {
    key: "prec", name: "Precuneus", short: "precuneus", side: "right",
    md: [8.39, 8.01, 8.14], soma: [0.400, 0.407, 0.403], neurite: [0.178, 0.187, 0.185], extra: [0.407, 0.392, 0.396],
    sig: { md: "p < 0.05", soma: "p = 0.044", neurite: "p = 0.024", extra: "p < 0.05" },
    story: "Both: a brief cell body swelling, plus denser cell processes at 30 min that are still there at 24 h.",
  },
  {
    key: "ppc", name: "Posterior parietal cortex", short: "PPC", side: "left",
    md: [8.16, 7.73, 7.85], soma: [0.386, 0.393, 0.387], neurite: [0.213, 0.222, 0.223], extra: [0.392, 0.376, 0.380],
    sig: { md: "p < 0.05", soma: "p = 0.043", neurite: "p = 0.0071", extra: "p < 0.001" },
    story: "Both: a brief cell body swelling, plus denser cell processes that last overnight.",
  },
];

// The scan (Methods): ultra high gradient multi shell diffusion MRI on the 3T Connectome scanner.
export const SCAN = {
  gradient: 300,            // mT/m, maximum gradient strength
  slew: 200,                // T/m/s
  voxel: 2,                 // mm, isotropic
  bValues: [200, 500, 1200, 2400, 4000, 6000, 8000], // s/mm^2, plus interspersed b = 0 images
  directions: [32, 32, 32, 32, 64, 64, 64],
  b0: 22,
  diffusionTime: 24,        // ms (Methods; the Discussion says 23 ms)
  pulse: 8,                 // ms
};

// The task (Methods): 15 blocks of 12 sequences (60 key presses), 25 s rest between blocks.
export const TASK = { sequence: [4, 1, 3, 2, 4], blocks: 15, perBlock: 12, rest: 25, people: 29 };

// Dial scales (my choice, so small changes are visible): one full turn of a SANDI dial is 0.04
// of the signal; one full turn of the MD dial is 10 % of its baseline.
export const DIAL_TURN = { fraction: 0.04, mdPercent: 10 };

// The pattern on the voxel's top face is a cartoon of what SANDI separates. Its changes are
// magnified ten times so they can be seen: soma radius and neurite count scale with
// 1 + 10 x (relative change from baseline).
export const MAGNIFY = 10;

export const delta = (series, t) => series[t] - series[0];
export const mdPercent = (r, t) => (100 * (r.md[t] - r.md[0])) / r.md[0];
