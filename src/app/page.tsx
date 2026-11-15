import { HowItWorks } from "@/components/home/how-it-works";
import { QuestionComposer } from "@/components/home/question-composer";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 sm:px-8 sm:pt-16">
      <header className="mb-8 space-y-3">
        <h1 className="text-[1.75rem] leading-[2.25rem] font-semibold tracking-tight text-ink sm:text-[2.25rem] sm:leading-[2.75rem]">
          Make the decision with the evidence in view.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate">
          Decision AI researches your options, verifies each claim against the source it came from, and shows you
          exactly why it recommends what it does.
        </p>
      </header>
      <QuestionComposer />
      <div className="mt-14">
        <HowItWorks />
      </div>
    </div>
  );
}
