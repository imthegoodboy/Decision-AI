const STEPS = [
  {
    name: "Understand",
    body: "Asks the few questions that would change the answer: budget, must-haves, what matters most to you.",
  },
  {
    name: "Research",
    body: "Plans searches from your priorities, reads the pages and rates each source with visible signals.",
  },
  {
    name: "Verify",
    body: "Checks every claim against the exact passage it came from and across independent sources.",
  },
  {
    name: "Compare",
    body: "Scores each option on your criteria using verified evidence only. Move a priority and the ranking updates.",
  },
  {
    name: "Recommend",
    body: "Explains the pick with cited reasons, trade-offs and open questions, sealed in a tamper-evident log.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="space-y-4">
      <h2 id="how-heading" className="text-base font-semibold text-ink">
        How it works
      </h2>
      <ol className="border-t border-rule">
        {STEPS.map((step, i) => (
          <li key={step.name} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-rule py-3 sm:grid-cols-[2.5rem_9rem_1fr]">
            <span className="pt-px text-sm font-semibold tabular-nums text-cobalt">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-sm font-semibold text-ink">{step.name}</span>
            <p className="col-start-2 text-sm leading-relaxed text-slate sm:col-start-3">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
