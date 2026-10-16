const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function filterCommands(commands, query, browseAll = false) {
  const q = normalize(query);
  if (!q) return commands.filter(command => browseAll || command.featured);
  const terms = q.split(/\s+/);
  return commands.map((command, index) => {
    const label = normalize(command.label);
    const keywords = normalize(`${command.keywords || ''} ${command.tag}`);
    const ranks = terms.map(term => label.startsWith(term) ? 0 : label.includes(term) ? 1 : keywords.includes(term) ? 2 : -1);
    if (ranks.includes(-1)) return null;
    // Exact names lead, then label matches, then skills and context. The source
    // order breaks ties so project results stay ahead of general destinations.
    const rank = label === q ? -2 : label.startsWith(q) ? -1 : ranks.reduce((sum, value) => sum + value, 0);
    return { command, rank, index };
  }).filter(Boolean).sort((a, b) => a.rank - b.rank || a.index - b.index).map(result => result.command);
}
