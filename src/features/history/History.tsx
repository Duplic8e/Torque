import { useMemo, useState } from 'preact/hooks';
import { Segmented } from '../../core/components/Fields';
import { useAppData, useUi } from '../../core/context';
import { fmtDateShort, fmtMonth, fmtMoney, fmtNum } from '../../core/format';
import type { Category } from '../../data/types';
import { recordCost } from '../../engine/costs';
import { filterRecords, groupByMonth, NO_FILTER, recordYears, type HistoryFilter } from '../../engine/history';

export function History() {
  const { records, items, vehicle } = useAppData();
  const ui = useUi();
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);

  const live = records.filter((r) => !r.deletedAt);
  const years = recordYears(live);
  const categories = useMemo(() => {
    const used = new Set<Category>();
    for (const r of live) for (const k of r.itemKeys) {
      const c = items.find((i) => i.key === k)?.category;
      if (c) used.add(c);
    }
    return [...used];
  }, [records, items]);
  const shown = filterRecords(live, items, filter);
  const groups = groupByMonth(shown);
  const filtering = JSON.stringify(filter) !== JSON.stringify(NO_FILTER);
  const nameOf = (k: string) => items.find((i) => i.key === k)?.name ?? k;

  if (live.length === 0) {
    return (
      <section class="empty">
        <h2>No services yet</h2>
        <p class="muted">Every oil change, rotation and repair you log shows up here.</p>
        <button type="button" class="btn btn-primary" onClick={() => ui.openSheet({ type: 'log' })}>Log your first service</button>
      </section>
    );
  }

  return (
    <>
      <label class="field">
        <span class="visually-hidden">Search history</span>
        <input class="input" type="search" placeholder="Search services, shop, notes, parts" value={filter.query}
          onInput={(e) => setFilter({ ...filter, query: (e.currentTarget as HTMLInputElement).value })} />
      </label>

      <div class="chips filter-row">
        {categories.map((c) => (
          <button key={c} type="button" class="select-chip" aria-pressed={filter.category === c}
            onClick={() => setFilter({ ...filter, category: filter.category === c ? undefined : c })}>{c}</button>
        ))}
      </div>
      <div class="row filter-row">
        <select class="input select-inline" aria-label="Year" value={filter.year ?? ''}
          onChange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; setFilter({ ...filter, year: v ? Number(v) : undefined }); }}>
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Segmented label="Done by" hideLabel value={filter.who}
          options={[{ value: 'all', label: 'All' }, { value: 'shop', label: 'Shop' }, { value: 'diy', label: 'DIY' }]}
          onChange={(who) => setFilter({ ...filter, who })} />
      </div>

      {groups.length === 0 && (
        <section class="empty">
          <p class="muted">Nothing matches those filters.</p>
          {filtering && <button type="button" class="btn btn-secondary" onClick={() => setFilter(NO_FILTER)}>Clear filters</button>}
        </section>
      )}

      {groups.map((g) => (
        <section key={g.month}>
          <h2 class="section-title">{fmtMonth(`${g.month}-01`)}</h2>
          <div class="group">
            {g.records.map((r) => {
              const cost = recordCost(r);
              return (
                <button key={r.id} type="button" class="list-row" onClick={() => ui.openSheet({ type: 'record', id: r.id })}>
                  <span class="row-top">
                    <span class="row-title">{fmtDateShort(r.date)}</span>
                    <span class="row-reading num">
                      {fmtNum(r.odometer)} {vehicle.units}
                      {cost > 0 && <span class="row-cost">{fmtMoney(cost)}</span>}
                    </span>
                  </span>
                  <span class="chips">
                    {r.itemKeys.length === 0 ? <span class="tag">Note</span> : r.itemKeys.map((k) => <span key={k} class="tag">{nameOf(k)}</span>)}
                  </span>
                  {(r.shop || r.diy) && <span class="row-bottom">{r.diy ? 'DIY' : r.shop}</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
