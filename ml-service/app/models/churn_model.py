import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

class ChurnModel:
    """
    File Churn Prediction Model
    Uses RandomForestRegressor to predict file churn probability
    """
    
    def __init__(self):
        self.model = None
        self.is_trained = False
        
    def load_or_train(self):
        """Load pre-trained model or train a new one"""
        model_path = os.path.join(os.path.dirname(__file__), '../../models/churn_model.joblib')
        
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.is_trained = True
                print("✅ Loaded pre-trained churn model")
                return
            except Exception as e:
                print(f"Could not load model: {e}")
        
        # Train with synthetic data for demo
        self._train_synthetic()
        
    def _train_synthetic(self):
        """Train model with synthetic data for demonstration"""
        np.random.seed(42)
        n_samples = 500
        
        # Features: [additions, deletions, modifications, churn_history]
        X = np.random.rand(n_samples, 4)
        X[:, 0] = X[:, 0] * 1000  # additions
        X[:, 1] = X[:, 1] * 1000  # deletions
        X[:, 2] = X[:, 2] * 50   # modifications
        X[:, 3] = X[:, 3] * 200  # churn history
        
        # Generate churn score (0-1)
        # Higher additions + deletions + modifications = higher churn
        y = (
            (X[:, 0] + X[:, 1]) / 2000 * 0.4 +
            X[:, 2] / 50 * 0.3 +
            X[:, 3] / 200 * 0.3
        )
        y = np.clip(y, 0, 1)
        
        # Train model
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.model.fit(X, y)
        self.is_trained = True
        
        # Save model
        os.makedirs(os.path.join(os.path.dirname(__file__), '../../models'), exist_ok=True)
        model_path = os.path.join(os.path.dirname(__file__), '../../models/churn_model.joblib')
        joblib.dump(self.model, model_path)
        
        print("✅ Trained new churn model with synthetic data")
    
    def predict(self, features):
        """Predict churn probability for file features"""
        if not self.is_trained:
            self.load_or_train()
        
        if features.shape[1] != 4:
            raise ValueError(f"Expected 4 features, got {features.shape[1]}")
        
        return np.clip(self.model.predict(features), 0, 1)
    
    def predict_batch(self, features):
        """Predict churn scores for multiple files"""
        if not self.is_trained:
            self.load_or_train()
        
        return np.clip(self.model.predict(features), 0, 1)
