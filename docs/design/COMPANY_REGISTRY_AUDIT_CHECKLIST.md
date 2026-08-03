# Company Registry Audit Checklist

Use this checklist before merging company-selection work.

## Identity

- [ ] RRC selection displays `assets/logos/RRC.png`.
- [ ] AR selection displays `assets/logos/AR.png`.
- [ ] CNX selection displays `assets/logos/CNX.png`.
- [ ] CRK selection displays `assets/logos/CRK.png`.
- [ ] EQT selection displays `assets/logos/EQT.png`.
- [ ] EXE selection displays `assets/logos/EXE.png`.
- [ ] GPOR selection displays `assets/logos/GPOR.svg`.
- [ ] Each logo uses registry-provided alt text.
- [ ] A failed image load produces a ticker fallback rather than a broken image.

## Selection synchronization

- [ ] Company name updates with the selected ticker.
- [ ] Company description updates with the selected ticker.
- [ ] Metric values update with the selected ticker.
- [ ] Primary chart series updates with the selected ticker.
- [ ] Map view and available exposure layers update with the selected ticker.
- [ ] Insights update with the selected ticker.
- [ ] Source drawer context updates with the selected ticker.
- [ ] No logo or data from the previous company remains after loading completes.

## Data integrity

- [ ] UI components do not hard-code company names or logo imports.
- [ ] Missing company data renders an explicit unavailable state.
- [ ] Empty route and exposure arrays do not generate inferred geography.
- [ ] Company additions require a registry entry before selector enablement.

## Responsive behavior

- [ ] Logos remain readable at small, medium, and large sizes.
- [ ] Company selector remains usable at mobile widths.
- [ ] Long company names do not overlap the logo or controls.
