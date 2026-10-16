import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands } from '../src/scripts/command-search.js';

const commands = [
  { label: 'Automated Impedance Matcher', tag: 'Project', featured: true, keywords: 'RF automation firmware PCB Hacker Fab' },
  { label: 'Real-Time Embedded Vehicle', tag: 'Project', featured: true, keywords: 'RTOS kernel carrier PCB firmware STM32' },
  { label: 'Kirby Companion', tag: 'Project', featured: true, keywords: 'ESP32 touch firmware display' },
  { label: 'Kirby LED Keychain', tag: 'Project', featured: true, keywords: '555 timer PCB discrete logic' },
  { label: 'Resume', tag: 'Page', featured: true, keywords: 'cv pdf qualifications' },
  { label: 'Contact', tag: 'Section', featured: true, keywords: 'email reach hiring' },
  { label: 'Projects', tag: 'Section', keywords: 'work portfolio builds' },
  { label: 'Copy email', tag: 'Action', keywords: 'contact mail address' },
  { label: 'Toggle theme', tag: 'Action', keywords: 'dark light appearance' },
];
const labels = results => results.map(result => result.label);

test('opening search suggests work and hiring links while all destinations remain available', () => {
  assert.deepEqual(labels(filterCommands(commands, '  ')), labels(commands.slice(0, 6)));
  assert.deepEqual(labels(filterCommands(commands, '', true)), labels(commands));
  assert.deepEqual(labels(filterCommands(commands, 'dark')), ['Toggle theme']);
});

test('an exact destination takes priority over keyword matches', () => {
  assert.deepEqual(labels(filterCommands(commands, 'contact')), ['Contact', 'Copy email']);
  assert.deepEqual(labels(filterCommands(commands, '  RÉSUMÉ  ')), ['Resume']);
  assert.equal(filterCommands(commands, 'projects')[0].label, 'Projects');
});

test('search matches multiple words across the project name and its engineering context', () => {
  assert.deepEqual(labels(filterCommands(commands, 'rtos pcb')), ['Real-Time Embedded Vehicle']);
  assert.deepEqual(labels(filterCommands(commands, 'kirby 555')), ['Kirby LED Keychain']);
  assert.deepEqual(labels(filterCommands(commands, '  RF   FIRMWARE ')), ['Automated Impedance Matcher']);
});

test('equal skill matches preserve project priority without changing the source list', () => {
  const original = labels(commands);
  assert.deepEqual(labels(filterCommands(commands, 'firmware')), original.slice(0, 3));
  assert.deepEqual(filterCommands(commands, 'missing sensor'), []);
  assert.deepEqual(labels(commands), original);
});
