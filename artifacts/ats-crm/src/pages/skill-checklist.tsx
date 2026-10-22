import { useEffect } from "react";

export default function SkillChecklistPage() {
  useEffect(() => {
    document.title = "Skill Checklist | HealthRecruit";
  }, []);

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[600px] overflow-hidden rounded-lg border bg-white">
      <iframe
        title="Healthcare Skill Checklist"
        src="/skill-checklist.html"
        className="h-full w-full border-0"
      />
    </div>
  );
}
