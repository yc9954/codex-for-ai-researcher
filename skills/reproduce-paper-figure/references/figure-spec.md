# Figure Evidence Contract

The figure specification preserves the paper's recoverable comparison structure:

```json
{
  "title": "A central paper comparison",
  "sourceLabel": "Table 2",
  "metric": "Accuracy",
  "unit": "%",
  "chart": "grouped-bar",
  "xLabel": "Model",
  "yLabel": "Accuracy (%)",
  "xScale": "linear",
  "yScale": "linear",
  "paperSha256": "64 lowercase hexadecimal characters",
  "series": [
    {
      "name": "Reported",
      "values": [
        { "label": "Baseline", "xValue": null, "value": 81.2, "error": null, "errorSourceValue": null, "page": 7, "sourceValue": "81.2", "quote": "The baseline obtained 81.2 accuracy while the proposed method obtained 84.6 accuracy." },
        { "label": "Proposed", "xValue": null, "value": 84.6, "error": null, "errorSourceValue": null, "page": 7, "sourceValue": "84.6", "quote": "The baseline obtained 81.2 accuracy while the proposed method obtained 84.6 accuracy." }
      ]
    }
  ]
}
```

`sourceValue` preserves the printed token and `value` is only its numeric normalization. An uncertainty requires both `error` and `errorSourceValue`; otherwise both are null. Every quote must be an exact 8-30 word passage containing its printed token on the cited pinned PDF page.

Use `grouped-bar` or `stacked-bar` only for aligned categorical labels, `line` for an explicit ordered sweep, and `scatter` for paired numeric observations. Line and scatter points require `xValue`. Preserve multi-series structure, metric, unit, axis labels, and justified linear/log scales. Values visible only as plot pixels are unavailable, not estimates.
