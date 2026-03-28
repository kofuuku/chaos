from sklearn.ensemble import IsolationForest
import numpy as np

class RiskScorer:
    def __init__(self):
        self.clf = IsolationForest(contamination=0.05, random_state=42, n_estimators=100)
        self.fitted = False

    def fit(self, baseline_features):
        X = [[f['mean'], f['std'], f['slope'], f['max']] for f in baseline_features]
        if not X:
            return
        self.clf.fit(X)
        self.fitted = True
        self.offset_ = self.clf.offset_
        print(f'IsolationForest trained on {len(X)} samples')

    def score(self, features):
        if not self.fitted:
            return 0.0
        X = [[features['mean'], features['std'], features['slope'], features['max']]]
        raw = self.clf.score_samples(X)[0]
        # Multiplier increased from 0.8 to 2.5 to allow true anomalies to reach 1.0 score
        risk = max(0.0, min(1.0, (self.offset_ - raw) / abs(self.offset_) * 2.5))
        return round(risk, 3)