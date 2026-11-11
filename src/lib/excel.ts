import { STATUS, type Analysis } from './analysis';
import { dow, WEEKDAY_NAMES, type Employee, type Issue, type Roster } from '../engine';

const FILL: Record<string, string> = {
  weekly_off: 'FFD9D9EA', leave: 'FFF6D6D5', comp_off: 'FFFCE8C8', holiday: 'FFD5EBDD',
};

/** Real .xlsx: one sheet for the roster (colour-coded) and one for conflicts. Loaded on demand. */
export async function downloadXlsx(name: string, an: Analysis, roster: Roster, employees: Employee[], issues: Issue[]) {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  const ws = wb.addWorksheet('Roster', { views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }] });
  const { ctx } = an;
  ws.addRow(['Employee', 'Pod', 'Role', ...ctx.dates.map((d) => `${d.slice(8)} ${WEEKDAY_NAMES[dow(d)].slice(0, 3)}`)]);
  ws.getRow(1).font = { bold: true };
  for (const e of employees) {
    const row = ws.addRow([e.name, ctx.podById.get(e.podId)?.name ?? '', e.role, ...ctx.dates.map((d) => {
      const s = roster[e.id]?.[d]?.status ?? 'work';
      return s === 'work' ? '' : STATUS[s].short;
    })]);
    ctx.dates.forEach((d, i) => {
      const s = roster[e.id]?.[d]?.status ?? 'work';
      const cell = row.getCell(4 + i);
      cell.alignment = { horizontal: 'center' };
      if (FILL[s]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[s] } };
    });
  }
  ws.getColumn(1).width = 22; ws.getColumn(2).width = 12; ws.getColumn(3).width = 10;
  for (let i = 0; i < ctx.dates.length; i++) ws.getColumn(4 + i).width = 5;
  const legend = wb.addWorksheet('Legend');
  legend.addRows([['Code', 'Meaning'], ['(blank)', 'Working'], ...(['weekly_off', 'leave', 'comp_off', 'holiday'] as const).map((s) => [STATUS[s].short, STATUS[s].label])]);
  const cs = wb.addWorksheet('Conflicts');
  cs.addRow(['Severity', 'Type', 'Date', 'Message', 'Suggested cover']).font = { bold: true };
  for (const i of issues) cs.addRow([i.severity, i.kind, i.date ?? '', i.message, (i.fixes ?? []).map((f) => f.name).join('; ')]);
  cs.getColumn(4).width = 90; cs.getColumn(5).width = 40;
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
