/**
 * @license
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const speedline = require('speedline');
const Audit = require('../audit');
const TracingProcessor = require('../../lib/traces/tracing-processor');

const FAILURE_MESSAGE = 'Navigation and first paint timings not found.';

// Parameters (in ms) for log-normal CDF scoring. To see the curve:
// https://www.desmos.com/calculator/mdgjzchijg
const SCORING_POINT_OF_DIMINISHING_RETURNS = 1250;
const SCORING_MEDIAN = 5500;

class SpeedIndexMetric extends Audit {
  /**
   * @override
   */
  static get category() {
    return 'Performance';
  }

  /**
   * @override
   */
  static get name() {
    return 'speed-index-metric';
  }

  /**
   * @override
   */
  static get description() {
    return 'Speed Index';
  }

  /**
   * @override
   */
  static get optimalValue() {
    return '1,000';
  }

  /**
   * @return {!Array<string>}
   */
  static get requiredArtifacts() {
    return ['traceContents'];
  }

  /**
   * Audits the page to give a score for the Speed Index.
   * @see  https://github.com/GoogleChrome/lighthouse/issues/197
   * @param {!Artifacts} artifacts The artifacts from the gather phase.
   * @return {!Promise<!AuditResult>} The score from the audit, ranging from 0-100.
   */
  static audit(artifacts) {
    return Promise.resolve(artifacts.traceContents).then(trace => {
      if (!trace || !Array.isArray(trace)) {
        throw new Error(FAILURE_MESSAGE);
      }
      return speedline(trace);
    }).then(results => {
      // Use the CDF of a log-normal distribution for scoring.
      //  10th Percentile = 2,240
      //  25th Percentile = 3,430
      //  Median = 5,500
      //  75th Percentile = 8,820
      //  95th Percentile = 17,400
      const distribution = TracingProcessor.getLogNormalDistribution(SCORING_MEDIAN,
          SCORING_POINT_OF_DIMINISHING_RETURNS);
      let score = 100 * distribution.computeComplementaryPercentile(results.speedIndex);

      // Clamp the score to 0 <= x <= 100.
      score = Math.min(100, score);
      score = Math.max(0, score);

      return {
        score: Math.round(score),
        rawValue: Math.round(results.speedIndex)
      };
    }).catch(err => {
      // Recover from trace parsing failures.
      return {
        score: -1,
        debugString: err.message
      };
    })
    .then(result => {
      return SpeedIndexMetric.generateAuditResult({
        value: result.score,
        rawValue: result.rawValue,
        debugString: result.debugString,
        optimalValue: this.optimalValue
      });
    });
  }
}

module.exports = SpeedIndexMetric;