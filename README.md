# The Danish Causal Atlas

Causal claims extracted from published economics papers that use Danish administrative registers, merged into one explorable graph: every accepted claim is a signed edge between concepts, with the paper, the design behind its main estimate, the sample it was computed on, and the sentences it rests on.

Live site: https://johanna-einsiedler.github.io/danish-causal-atlas/

This repository holds the static site (`index.html`, `app.js`, `app.css`, vendored d3 and MiniSearch) and the data files the pipeline builds (`data/graph.json`, `data/taxonomy.json`, `data/papers.json`, `data/stats.json`). It is rebuilt from the extraction pipeline; nothing here is edited by hand. The data carries paper metadata, machine-written claim statements and short verified quotes; no full abstracts, no PDFs.
