import numpy as np
from sklearn.ensemble import IsolationForest
import joblib
import os

class AnomalyModel:
    """
    Contributor Anomaly Detection Model
    Uses Isolation Forest to detect unusual contributor patterns
    """
    
    def __init__(self):
        self.model = None
        self.is_trained = False
        
    def load_or_train(self):
        """Load pre-trained model or train a new one"""
        model_path = os.path.join(os.path.dirname(__file__), '../../models/anomaly_model.joblib')
        
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.is_trained = True
                print("✅ Loaded pre-trained anomaly model")
                return
            except Exception as e:
                print(f"Could not load model: {e}")
        
        # Train with synthetic data for demo
        self._train_synthetic()
        
    def _train_synthetic(self):
        """Train model with synthetic data for demonstration"""
        np.random.seed(42)
        n_samples = 200
        
        # Features: [experience_score, contributions, rejection_rate]
        # Normal contributors (inliers)
        X_normal = np.random.multivariate_normal(
            mean=[50, 50, 0.1],
            cov=[[400, 100, 0.05], [100, 400, 0.05], [0.05, 0.05, 0.02]],
            size=int(n_samples * 0.9)
        )
        
        # Anomalous contributors (outliers)
        X_anomaly = np.random.multivariate_normal(
            mean=[5, 200, 0.8],
            cov=[[10, 20, 0.01], [20, 100, 0.01], [0.01, 0.01, 0.01]],
            size=int(n_samples * 0.1)
        )
        
        X = np.vstack([X_normal, X_anomaly])
        
        # Train Isolation Forest
        self.model = IsolationForest(
            n_estimators=100,
            contamination=0.1,
            random_state=42
        )
        self.model.fit(X)
        self.is_trained = True
        
        # Save model
        os.makedirs(os.path.join(os.path.dirname(__file__), '../../models'), exist_ok=True)
        model_path = os.path.join(os.path.dirname(__file__), '../../models/anomaly_model.joblib')
        joblib.dump(self.model, model_path)
        
        print("✅ Trained new anomaly model with synthetic data")
    
    def predict(self, features):
        """
        Predict anomaly scores for contributor features
        Returns scores between 0-1 where higher = more anomalous
        """
        if not self.is_trained:
            self.load_or_train()
        
        if features.shape[1] != 3:
            raise ValueError(f"Expected 3 features, got {features.shape[1]}")
        
        # Get anomaly scores (-1 to 1 from Isolation Forest)
        # Convert to 0-1 scale where 1 = most anomalous
        raw_scores = self.model.decision_function(features)
        
        # Normalize to 0-1
        normalized_scores = (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-10)
        
        # Invert: higher score = more anomalous
        anomaly_scores = 1 - normalized_scores
        
        return anomaly_scores
    
    def predict_batch(self, features):
        """Predict anomaly scores for multiple contributors"""
        if not self.is_trained:
            self.load_or_train()
        
        return self.predict(features)
    
    def flag_anomalies(self, features, threshold=0.7):
        """Return boolean array indicating which contributors are anomalous"""
        scores = self.predict(features)
        return scores > threshold
