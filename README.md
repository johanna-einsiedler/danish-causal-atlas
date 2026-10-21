# The Danish Causal Atlas

Causal claims extracted from published economics papers that use Danish administrative registers, merged into one explorable graph: every accepted claim is a signed edge between concepts, with the paper, the design behind its main estimate, the sample it was computed on, and the sentences it rests on.

Live site: https://johanna-einsiedler.github.io/danish-causal-atlas/

This repository holds the static site (`index.html`, `app.js`, `app.css`, vendored d3 and MiniSearch) and the data files the pipeline builds (`data/graph.json`, `data/taxonomy.json`, `data/papers.json`, `data/stats.json`). It is rebuilt from the extraction pipeline; nothing here is edited by hand. The data carries paper metadata, machine-written claim statements and short verified quotes; no full abstracts, no PDFs.

## Where the data comes from

The site first looks for `data/source.json`. When it names a Zenodo concept record, the page asks Zenodo for the
latest published version of that concept at every page open and loads `graph.json`, `taxonomy.json`, `papers.json`
and `stats.json` from it, so a new version deposited on Zenodo shows here without a redeploy; the About page says
which version is on screen. Without `source.json`, or when Zenodo cannot be reached, the files bundled in `data/`
are used.

## How to cite

The claims dataset the atlas is built from (the stated claims of every paper with their evidence and table
results; the About page of the site shows the latest version Zenodo lists):

> Johanna Einsiedler (2026). Claims in Danish register-data economics papers (version 1) [Data set]. Metalens.
> https://doi.org/10.5281/zenodo.23514504 (all versions: https://doi.org/10.5281/zenodo.23514503)

The import schema the claims follow:

> Einsiedler, J. (2026). Claims in empirical economics papers: import schema (version 1) [Software]. Metalens.
> https://doi.org/10.5281/zenodo.23520761
