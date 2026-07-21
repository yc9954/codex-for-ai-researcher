import { expect, test as setup } from "@playwright/test";

setup("pin live paper and repository sources", async ({ request }) => {
  setup.setTimeout(180_000);
  for (let batch = 0; batch < 20; batch += 1) {
    const stored = await request.get("/api/studies").then((result) => result.json()) as { studies?: Array<{ studyId: string }> };
    const studies = stored.studies || [];
    if (studies.length === 0) break;
    for (const study of studies) expect((await request.delete(`/api/studies/${study.studyId}`, { data: {} })).ok()).toBe(true);
    if (studies.length < 200) break;
  }
  const connectors = await request.get("/api/connectors").then((result) => result.json()) as { agents?: Array<{ id: string }>; hooks?: Array<{ id: string }>; skills?: Array<{ id: string }> };
  for (const agent of connectors.agents || []) await request.delete(`/api/connectors/agents/${agent.id}`, { data: {} });
  for (const hook of connectors.hooks || []) await request.delete(`/api/connectors/hooks/${hook.id}`, { data: {} });
  for (const skill of connectors.skills || []) await request.delete(`/api/connectors/skills/${skill.id}`, { data: {} });
  const response = await request.post("/api/studies/inspect", {
    timeout: 180_000,
    data: {
      paperUrl: "https://arxiv.org/abs/2106.09685",
      repositoryUrl: "https://github.com/microsoft/LoRA",
    },
  });
  expect(response.ok()).toBe(true);
  const study = await response.json();
  expect(study.paper.title).toContain("Low-Rank Adaptation");
  expect(study.paper.authors.length).toBeGreaterThan(0);
  expect(study.repository.fullName).toBe("microsoft/LoRA");
  expect(study.repository.commitSha).toMatch(/^[a-f0-9]{40}$/);
  expect(study.repository.manifests).toContain("setup.py");
  expect(study.repository.dependencyManifests).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "setup.py", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
  ]));
  expect(study.paperDocument).toMatchObject({ extractor: "unpdf-pdfjs" });
  expect(study.paperDocument.retainedPages).toBeGreaterThan(10);
  expect(study.paperDocument.characterCount).toBeGreaterThan(10_000);
  expect(study.paperDocument.sha256).toMatch(/^[a-f0-9]{64}$/);
});
