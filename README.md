# The Danish Causal Atlas

A browsable atlas of the stated causal claims in economics papers that use Danish
administrative register data: a causal graph over harmonised cause/effect concepts,
every edge backed by the claims that assert it, every claim backed by verbatim
quotes from its paper.

**Provenance.** The data is built from a frozen, public release of the
[Register-data claims — agent (Danish)](https://github.com/johanna-einsiedler/metalens-datasets/tree/main/datasets/register-data-claims-agent-danish-4d724d9c)
dataset on Metalens (release v1). The claims were extracted from the papers' own
wording by an AI agent and cross-checked against independently extracted regression
tables (141 exact value matches, 0 mismatches) — but **no record has been
individually human-verified yet**, and the site says so on every page. The concept
nodes come from the release's committed cause/effect vocabulary; a phrase coded as
the mirror image of its concept (for example a *net-of-tax* rate under a *marginal
tax* concept) has its sign flipped when claims aggregate onto an edge, so mirror
phrasings agree instead of contradicting each other.

## Serving it

The site is static — any file server works:

    python3 -m http.server 8765
    open http://127.0.0.1:8765/

## Rebuilding the data

`data/` is generated from the dataset release by
[`build_site_from_release.py`](https://github.com/johanna-einsiedler/danish-register-econ)
(in the danish-register-econ pipeline):

    python pipeline/build_site_from_release.py \
        --release <path to releases/v1 of the dataset> \
        --out <this repo>/data

When the dataset gains a new release (more papers, human verification), rebuild and
commit — the site never reads anything but `data/`.

## What the viewer shows

- **Graph** — concepts rolled up by domain; filters for design, period, sex,
  contested edges.
- **Variables** — every concept, its definition, and the papers that touch it.
- **Relations** — every cause→effect edge with sign consensus and contradictions.
- **Papers** — the corpus, each paper reduced to its abstract-anchored claims.

The viewer originates from the danish-register-econ project's site; the data layer
was re-pointed from that pipeline's internal files to the public Metalens release.
Dataset license: CC-BY-4.0.
