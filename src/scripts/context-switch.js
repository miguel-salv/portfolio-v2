// A conceptual trace of the documented RTOS, advanced only by the visitor.
export const contextSteps = [
  { title: 'Thread A is running', description: 'Thread A executes on its process stack (PSP). This kernel also keeps a separate kernel stack for each thread.', nodes: ['thread-a'], edge: null },
  { title: 'SysTick requests a switch', description: 'Exception entry saves the hardware frame on PSP. SysTick updates thread budgets and pends PendSV.', nodes: ['tick'], edge: 'tick' },
  { title: 'PendSV takes over', description: 'The deferred exception enters the kernel’s handler path, using MSP.', nodes: ['handler'], edge: 'handler' },
  { title: 'Save Thread A’s context', description: 'The wrapper pushes PSP, R4–R11 and LR onto the kernel stack. The C handler records that saved frame in Thread A’s TCB.', nodes: ['handler', 'save', 'store'], edge: null },
  { title: 'Choose the next runnable thread', description: 'Still inside PendSV, the scheduler checks runnable threads in priority order. Here, it selects Thread B.', nodes: ['handler', 'tcb', 'select'], edge: 'tcb' },
  { title: 'Restore Thread B’s context', description: 'The C handler returns Thread B’s saved kernel frame to the same PendSV wrapper. It restores MSP, registers and PSP; no second exception is entered.', nodes: ['handler', 'restore'], edge: 'restore' },
  { title: 'Thread B resumes', description: 'Exception return restores the hardware frame from Thread B’s PSP and resumes its execution.', nodes: ['thread-b'], edge: 'thread-b' },
];

export function mountContextSwitch(root) {
  const controller = new AbortController();
  const controls = root.querySelector('[data-context-controls]');
  const next = root.querySelector('[data-context-next]');
  const back = root.querySelector('[data-context-back]');
  const reset = root.querySelector('[data-context-reset]');
  const count = root.querySelector('[data-context-count]');
  const title = root.querySelector('[data-context-title]');
  const description = root.querySelector('[data-context-description]');
  const nodes = [...root.querySelectorAll('[data-context-node]')];
  const edges = [...root.querySelectorAll('[data-context-edge]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let index = -1;
  let traces = [];
  function render(value) {
    index = Math.max(-1, Math.min(contextSteps.length - 1, value));
    traces.forEach(animation => animation.cancel());
    traces = [];
    const step = contextSteps[index];
    root.classList.toggle('is-stepping', Boolean(step));
    nodes.forEach(node => node.classList.toggle('is-current', Boolean(step?.nodes.includes(node.dataset.contextNode))));
    edges.forEach(edge => {
      const active = edge.dataset.contextEdge === step?.edge;
      edge.classList.toggle('is-current', active);
      if (active && !motion.matches && edge.animate) traces.push(edge.animate([{ strokeDasharray: '1', strokeDashoffset: 1 }, { strokeDasharray: '1', strokeDashoffset: 0 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }));
    });
    count.textContent = step ? `${index + 1} / ${contextSteps.length}` : 'Overview';
    title.textContent = step?.title || 'The complete context switch';
    description.textContent = step?.description || 'Follow one handoff from Thread A to Thread B.';
    next.firstChild.textContent = index < 0 ? 'Step through' : index === contextSteps.length - 1 ? 'Replay' : 'Next step';
    back.disabled = index <= 0;
    reset.disabled = index < 0;
    // Keep the diagram beside the explanation after the browser scrolls a
    // distant button into view. Never move a figure too tall for the viewport.
    const rect = root.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(root).scrollMarginTop) || 0;
    if (step && rect.height + inset <= innerHeight && (rect.top < inset || rect.bottom > innerHeight)) root.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const options = { signal: controller.signal };
  next.addEventListener('click', () => render(index === contextSteps.length - 1 ? 0 : index + 1), options);
  back.addEventListener('click', () => render(index - 1), options);
  reset.addEventListener('click', () => render(-1), options);
  motion.addEventListener('change', () => { traces.forEach(animation => animation.cancel()); traces = []; }, options);
  controls.hidden = false;
  return () => { controller.abort(); traces.forEach(animation => animation.cancel()); };
}
