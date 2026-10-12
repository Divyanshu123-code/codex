/**
 * Pure deterministic input quality and uncertainty validation engine
 * for defence-domain AI governance (AegisOS Adaptation Plan - Section 5)
 */

export interface InputRequirementsConfig {
  required_fields?: string[];
  freshness_max_age_seconds?: number;
  ranges?: Record<string, { min?: number; max?: number }>;
  require_source_id?: boolean;
  conflict_detection?: boolean;
}

export interface UncertaintyRuleConfig {
  metric?: string; // e.g. "model_confidence", "threat_confidence", "provenance_reliability"
  minimum_threshold?: number;
  on_below_threshold?: 'REQUIRE_APPROVAL' | 'BLOCK';
  reason?: string;
  mandatory?: boolean;
}

export interface QualityCheckDetail {
  name: string;
  passed: boolean;
  details: string;
}

export interface InputQualityEvaluationResult {
  valid: boolean;
  decisionOverride?: 'REQUIRE_APPROVAL' | 'BLOCK';
  reasonCode?: string;
  explanation?: string;
  checks: QualityCheckDetail[];
  missingFields: string[];
  freshnessResult?: {
    timestamp?: number;
    ageSeconds?: number;
    maxAgeSeconds?: number;
    isFresh: boolean;
  };
  rangeViolations?: Array<{
    field: string;
    value: number;
    min?: number;
    max?: number;
  }>;
  uncertaintyResult?: {
    metric?: string;
    suppliedValue?: number;
    threshold?: number;
    passed: boolean;
    details: string;
  };
  conflictsDetected?: Array<{
    sourceA: string;
    sourceB: string;
    conflictDescription: string;
  }>;
}

/**
 * Deterministically checks input data quality against configured requirements.
 */
export function evaluateInputQuality(
  parameters: Record<string, any> | undefined,
  requirements: InputRequirementsConfig | undefined,
  uncertaintyRule: UncertaintyRuleConfig | undefined,
  now: number = Date.now()
): InputQualityEvaluationResult {
  const checks: QualityCheckDetail[] = [];
  const missingFields: string[] = [];
  const rangeViolations: Array<{ field: string; value: number; min?: number; max?: number }> = [];
  const conflictsDetected: Array<{ sourceA: string; sourceB: string; conflictDescription: string }> = [];

  const params = parameters || {};
  // Telemetry or evidence may be embedded or top-level
  const evidenceObj = params.evidence || params.telemetry || params.readings || params;

  // 1. Check Required Fields
  if (requirements?.required_fields && requirements.required_fields.length > 0) {
    const sources = params.sources || params.multi_source_reports || evidenceObj.sources;
    if (Array.isArray(sources) && sources.length > 0) {
      // Validate required fields on each report in multi-source array
      for (const src of sources) {
        for (const field of requirements.required_fields) {
          if (src[field] === undefined || src[field] === null || src[field] === '') {
            missingFields.push(`${src.source_id || 'source'}.${field}`);
          }
        }
      }
    } else {
      for (const field of requirements.required_fields) {
        const val = evidenceObj[field] !== undefined ? evidenceObj[field] : params[field];
        if (val === undefined || val === null || val === '') {
          missingFields.push(field);
        }
      }
    }

    if (missingFields.length > 0) {
      checks.push({
        name: 'REQUIRED_FIELDS_CHECK',
        passed: false,
        details: `Missing mandatory input field(s): ${missingFields.join(', ')}`
      });
    } else {
      checks.push({
        name: 'REQUIRED_FIELDS_CHECK',
        passed: true,
        details: `All ${requirements.required_fields.length} required fields verified present`
      });
    }
  }

  // 2. Check Freshness Window
  let freshnessResult: InputQualityEvaluationResult['freshnessResult'] | undefined;
  if (requirements?.freshness_max_age_seconds !== undefined && requirements.freshness_max_age_seconds > 0) {
    const sources = params.sources || params.multi_source_reports || evidenceObj.sources;
    const maxAgeSec = requirements.freshness_max_age_seconds;

    if (Array.isArray(sources) && sources.length > 0) {
      let allFresh = true;
      let oldestAge = 0;
      for (const s of sources) {
        if (typeof s.timestamp === 'number') {
          const age = Math.max(0, Math.floor((now - s.timestamp) / 1000));
          if (age > oldestAge) oldestAge = age;
          if (age > maxAgeSec) allFresh = false;
        } else {
          allFresh = false;
        }
      }

      freshnessResult = {
        ageSeconds: oldestAge,
        maxAgeSeconds: maxAgeSec,
        isFresh: allFresh
      };

      checks.push({
        name: 'DATA_FRESHNESS_CHECK',
        passed: allFresh,
        details: allFresh
          ? `All reports are fresh (oldest: ${oldestAge}s <= max: ${maxAgeSec}s)`
          : `One or more reports are STALE (oldest: ${oldestAge}s > max: ${maxAgeSec}s)`
      });
    } else {
      const ts = evidenceObj.timestamp || params.timestamp;
      if (typeof ts === 'number') {
        const ageSeconds = Math.max(0, Math.floor((now - ts) / 1000));
        const isFresh = ageSeconds <= maxAgeSec;
        freshnessResult = {
          timestamp: ts,
          ageSeconds,
          maxAgeSeconds: maxAgeSec,
          isFresh
        };

        checks.push({
          name: 'DATA_FRESHNESS_CHECK',
          passed: isFresh,
          details: isFresh
            ? `Data timestamp is fresh (age: ${ageSeconds}s <= max: ${maxAgeSec}s)`
            : `Data timestamp is STALE (age: ${ageSeconds}s exceeds configured window of ${maxAgeSec}s)`
        });
      } else {
        freshnessResult = {
          isFresh: false
        };
        checks.push({
          name: 'DATA_FRESHNESS_CHECK',
          passed: false,
          details: 'Timestamp missing or non-numeric for freshness evaluation'
        });
      }
    }
  }

  // 3. Check Numerical Ranges
  if (requirements?.ranges) {
    for (const [field, range] of Object.entries(requirements.ranges)) {
      const rawVal = evidenceObj[field] !== undefined ? evidenceObj[field] : params[field];
      if (typeof rawVal === 'number') {
        const tooLow = range.min !== undefined && rawVal < range.min;
        const tooHigh = range.max !== undefined && rawVal > range.max;
        if (tooLow || tooHigh) {
          rangeViolations.push({ field, value: rawVal, min: range.min, max: range.max });
        }
      }
    }

    if (rangeViolations.length > 0) {
      checks.push({
        name: 'VALUE_RANGE_CHECK',
        passed: false,
        details: `Values out of permitted range: ${rangeViolations.map((v) => `${v.field}=${v.value} (bounds [${v.min ?? '-inf'}, ${v.max ?? '+inf'}])`).join('; ')}`
      });
    } else {
      checks.push({
        name: 'VALUE_RANGE_CHECK',
        passed: true,
        details: 'All verified numeric fields conform to permitted safe ranges'
      });
    }
  }

  // 4. Check Source Identifiers
  if (requirements?.require_source_id) {
    const srcId = evidenceObj.source_id || params.source_id;
    const hasSource = Boolean(srcId && typeof srcId === 'string' && srcId.trim().length > 0);
    checks.push({
      name: 'SOURCE_IDENTIFIER_CHECK',
      passed: hasSource,
      details: hasSource ? `Source ID verified: ${srcId}` : 'Mandatory source identifier missing from input'
    });
  }

  // 5. Conflicting Source Detection
  if (requirements?.conflict_detection) {
    const sources = params.sources || params.multi_source_reports || evidenceObj.sources;
    if (Array.isArray(sources) && sources.length >= 2) {
      for (let i = 0; i < sources.length; i++) {
        for (let j = i + 1; j < sources.length; j++) {
          const s1 = sources[i];
          const s2 = sources[j];

          // Check opposing claims
          if (s1.status && s2.status && s1.status !== s2.status) {
            conflictsDetected.push({
              sourceA: s1.source_id || s1.report_id || `Source-${i + 1}`,
              sourceB: s2.source_id || s2.report_id || `Source-${j + 1}`,
              conflictDescription: `Contradictory status detected on target: '${s1.status}' vs '${s2.status}'`
            });
          }

          // Check semantic conflict in observation strings (e.g. intact vs destroyed)
          if (typeof s1.observation === 'string' && typeof s2.observation === 'string') {
            const obs1 = s1.observation.toLowerCase();
            const obs2 = s2.observation.toLowerCase();
            const hasIntactVsDestroyed =
              (obs1.includes('intact') && obs2.includes('destroyed')) ||
              (obs1.includes('destroyed') && obs2.includes('intact')) ||
              (obs1.includes('open') && obs2.includes('impassable')) ||
              (obs1.includes('impassable') && obs2.includes('open'));

            if (hasIntactVsDestroyed) {
              conflictsDetected.push({
                sourceA: s1.source_id || s1.report_id || `Source-${i + 1}`,
                sourceB: s2.source_id || s2.report_id || `Source-${j + 1}`,
                conflictDescription: `Conflicting observations on target infrastructure: '${s1.observation}' vs '${s2.observation}'`
              });
            }
          }
        }
      }
    }

    if (conflictsDetected.length > 0) {
      checks.push({
        name: 'CONFLICTING_EVIDENCE_CHECK',
        passed: false,
        details: `Identified ${conflictsDetected.length} contradictory claim(s) between multi-source reports`
      });
    } else {
      checks.push({
        name: 'CONFLICTING_EVIDENCE_CHECK',
        passed: true,
        details: 'No conflicting claims detected across input reports'
      });
    }
  }

  // 6. Evaluate Uncertainty / Model Confidence
  let uncertaintyResult: InputQualityEvaluationResult['uncertaintyResult'] | undefined;
  if (uncertaintyRule && (uncertaintyRule.metric || uncertaintyRule.minimum_threshold !== undefined)) {
    const metricName = uncertaintyRule.metric || 'confidence';
    // Look up supplied metric in parameters or evidence (NEVER FABRICATE)
    const suppliedVal = params[metricName] !== undefined
      ? params[metricName]
      : evidenceObj[metricName] !== undefined
      ? evidenceObj[metricName]
      : params.confidence !== undefined
      ? params.confidence
      : undefined;

    const threshold = uncertaintyRule.minimum_threshold ?? 0.8;

    if (suppliedVal === undefined) {
      // Missing mandatory uncertainty
      uncertaintyResult = {
        metric: metricName,
        passed: false,
        details: `Agent supplied NO ${metricName} metadata. System refused to fabricate confidence score.`
      };
      checks.push({
        name: 'UNCERTAINTY_ASSESSMENT',
        passed: false,
        details: uncertaintyResult.details
      });
    } else if (typeof suppliedVal === 'number') {
      const meetsThreshold = suppliedVal >= threshold;
      uncertaintyResult = {
        metric: metricName,
        suppliedValue: suppliedVal,
        threshold,
        passed: meetsThreshold,
        details: meetsThreshold
          ? `Supplied ${metricName} (${suppliedVal}) meets minimum policy threshold (${threshold})`
          : `Supplied ${metricName} (${suppliedVal}) is BELOW threshold (${threshold})`
      };
      checks.push({
        name: 'UNCERTAINTY_ASSESSMENT',
        passed: meetsThreshold,
        details: uncertaintyResult.details
      });
    }
  }

  // Determine Overall Decision Override based on Failures
  if (missingFields.length > 0) {
    return {
      valid: false,
      decisionOverride: 'BLOCK',
      reasonCode: 'MISSING_REQUIRED_INPUT_FIELDS',
      explanation: `Input quality check failed: missing required field(s) [${missingFields.join(', ')}].`,
      checks,
      missingFields,
      freshnessResult,
      rangeViolations,
      uncertaintyResult,
      conflictsDetected
    };
  }

  if (rangeViolations.length > 0) {
    return {
      valid: false,
      decisionOverride: 'BLOCK',
      reasonCode: 'INPUT_VALUES_OUT_OF_RANGE',
      explanation: `Input quality check failed: values exceed permitted physical operating bounds.`,
      checks,
      missingFields,
      freshnessResult,
      rangeViolations,
      uncertaintyResult,
      conflictsDetected
    };
  }

  if (freshnessResult && !freshnessResult.isFresh) {
    return {
      valid: false,
      decisionOverride: 'REQUIRE_APPROVAL',
      reasonCode: 'STALE_TELEMETRY_HELD_FOR_HUMAN',
      explanation: `Telemetry is stale (${freshnessResult.ageSeconds}s old; maximum permitted is ${freshnessResult.maxAgeSeconds}s). Held for human review.`,
      checks,
      missingFields,
      freshnessResult,
      rangeViolations,
      uncertaintyResult,
      conflictsDetected
    };
  }

  if (conflictsDetected.length > 0) {
    return {
      valid: false,
      decisionOverride: 'REQUIRE_APPROVAL',
      reasonCode: 'CONFLICTING_EVIDENCE_HELD_FOR_HUMAN',
      explanation: `Conflicting intelligence reports detected (${conflictsDetected[0].conflictDescription}). Held for human reviewer resolution.`,
      checks,
      missingFields,
      freshnessResult,
      rangeViolations,
      uncertaintyResult,
      conflictsDetected
    };
  }

  if (uncertaintyResult && !uncertaintyResult.passed) {
    const override = uncertaintyRule?.on_below_threshold || 'REQUIRE_APPROVAL';
    const reason = uncertaintyResult.suppliedValue === undefined
      ? 'MISSING_MANDATORY_UNCERTAINTY_METADATA'
      : (uncertaintyRule?.reason || 'UNCERTAINTY_THRESHOLD_EXCEEDED_REQUIRES_HUMAN');
    return {
      valid: false,
      decisionOverride: override,
      reasonCode: reason,
      explanation: uncertaintyResult.details,
      checks,
      missingFields,
      freshnessResult,
      rangeViolations,
      uncertaintyResult,
      conflictsDetected
    };
  }

  // All checks passed
  return {
    valid: true,
    checks,
    missingFields,
    freshnessResult,
    rangeViolations,
    uncertaintyResult,
    conflictsDetected
  };
}
