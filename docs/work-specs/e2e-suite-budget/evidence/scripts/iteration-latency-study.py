"""Offline arithmetic for iteration-latency-receipts.json; never queries or mutates GitHub.

Run from any directory: python <this-file>. Input capture and bounded API recipes are
documented in iteration-latency-report.md. Times are minutes, not runner-minutes.
"""
import datetime
import json
from pathlib import Path


def minutes(start, end):
    if not start or not end:
        return None
    parse = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    value = (parse(end) - parse(start)).total_seconds() / 60
    if value < 0:
        raise ValueError(f"Negative interval: {start} -> {end}")
    return value


def gate_job(job):
    name = job["name"]
    return (name in {"Build", "Factory gates", "E2E plan", "Catalog calibration gate"}
            or name.startswith("E2E ") or name.startswith("Guided mod"))


def main():
    evidence = Path(__file__).resolve().parent.parent
    data = json.loads((evidence / "iteration-latency-receipts.json").read_text())
    baseline = json.loads((evidence / "landing-speed-measurements.json").read_text())
    runs = {run["id"]: run for run in data["runs"]}
    out = []
    for pr in data["prs"]:
        entries = sorted(event["createdAt"] for event in pr["queueEvents"]
                         if event["__typename"] == "AddedToMergeQueueEvent")
        first = runs[pr["firstPrRun"]]
        first_gate = next(job for job in first["jobs"] if job["name"] == "CI gate")
        row = {
            "pr": pr["number"], "cohort": pr["cohort"],
            "openToFirstQueue": minutes(pr["createdAt"], entries[0]),
            "firstPrRunToGate": minutes(first["created_at"], first_gate["completed_at"]),
            "firstPrGateConclusion": first_gate["conclusion"],
            "firstPrRunConclusion": first["conclusion"],
            "prRuns": len(pr["prRuns"]),
            "firstToLastQueue": minutes(entries[0], entries[-1]),
            "queueToLand": minutes(entries[0], pr["mergedAt"]),
        }
        if pr["finalMergeRun"]:
            run = runs[pr["finalMergeRun"]]
            jobs = run["jobs"]
            gate = next(job for job in jobs if job["name"] == "CI gate")
            plan = next(job for job in jobs if job["name"] == "E2E plan")
            dependencies = [job for job in jobs if gate_job(job) and job["conclusion"] != "skipped"]
            critical = max(dependencies, key=lambda job: job["completed_at"])
            # The sampled critical paths contain no executed retry. Refuse to infer its
            # eligibility as plan completion if a future capture introduces one.
            assert not any(job["name"].startswith("E2E retry") for job in dependencies)
            is_child = (critical["name"].startswith("E2E ") and critical["name"] != "E2E plan"
                        or critical["name"].startswith("Guided mod")
                        or critical["name"] == "Catalog calibration gate")
            ready = plan["completed_at"] if is_child else run["created_at"]
            row.update({
                "finalMergeRun": run["id"],
                "queueToFinalRunCreated": minutes(entries[0], run["created_at"]),
                "finalRunToGate": minutes(run["created_at"], gate["completed_at"]),
                "gateToLand": minutes(gate["completed_at"], pr["mergedAt"]),
                "lastDependency": critical["name"],
                "runToLastDependencyReady": minutes(run["created_at"], ready),
                "lastDependencyReadyToStart": minutes(ready, critical["started_at"]),
                "lastDependencyExecution": minutes(critical["started_at"], critical["completed_at"]),
                "gateReadyToStart": minutes(critical["completed_at"], gate["started_at"]),
                "gateExecution": minutes(gate["started_at"], gate["completed_at"]),
            })
            assert abs(row["queueToFinalRunCreated"] + row["finalRunToGate"]
                       + row["gateToLand"] - row["queueToLand"]) < 1e-8
            assert abs(sum(row[key] for key in ["runToLastDependencyReady",
                       "lastDependencyReadyToStart", "lastDependencyExecution",
                       "gateReadyToStart", "gateExecution"]) - row["finalRunToGate"]) < 1e-8
        out.append({key: round(value, 3) if isinstance(value, float) else value
                    for key, value in row.items()})
    deltas = [minutes(row[1], row[2]) for row in baseline["landingRows"] if row[1] != row[2]]
    probes = data["selectionProbes"]
    overlap = []
    for pair in probes["pairs"]:
        left = set(probes["plans"][pair["a"]]["specs"])
        right = set(probes["plans"][pair["b"]]["specs"])
        weight = lambda names: sum(probes["tableWeights"][name] for name in sorted(names))
        computed = {"intersection": len(left & right), "union": len(left | right),
                    "overlapTableMinutes": weight(left & right),
                    "unionTableMinutes": weight(left | right),
                    "separateTableMinutes": weight(left) + weight(right)}
        for key, value in computed.items():
            assert abs(value - pair[key]) < 1e-8, f"Overlap mismatch: {key}"
        overlap.append({"a": pair["a"], "b": pair["b"], **computed})
    print(json.dumps({"cases": out, "baselineReentries": {
        "count": len(deltas), "firstToLastEntryMinutesTotal": sum(deltas),
        "meaning": "Wall intervals across PRs, possibly overlapping; not active repair time."
    }, "selectionOverlap": overlap}, indent=2))


if __name__ == "__main__":
    main()
