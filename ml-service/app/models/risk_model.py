import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import joblib
import os

# Feature names for explanation
FEATURE_NAMES = [
    "PR Size (Lines)",
    "Files Changed",
    "Commit Count",
    "Review Comments",
    "Time to Merge",
    "Contributor Rejection Rate",
    "Contributor Experience",
    "File Churn Score"
]

# Feature descriptions for human-readable output
FEATURE_DESCRIPTIONS = {
    "PR Size (Lines)": "Large PR Size",
    "Files Changed": "High File Count",
    "Commit Count": "Many Commits",
    "Review Comments": "Review Activity",
    "Time to Merge": "Slow Merge Time",
    "Contributor Rejection Rate": "High Rejection Rate",
    "Contributor Experience": "Low Contributor Experience",
    "File Churn Score": "High File Churn"
}

class RiskModel:
    """
    PR Risk Prediction Model
    Uses RandomForestClassifier to predict risk scores (0-1)
    with explainable feature importance
    """
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.is_trained = False
        self.feature_importances_ = None
        
    def load_or_train(self):
        """Load pre-trained model or train a new one"""
        model_path = os.path.join(os.path.dirname(__file__), '../../models/risk_model.joblib')
        
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                self.is_trained = True
                # Extract feature importances
                self.feature_importances_ = self.model.feature_importances_
                print("✅ Loaded pre-trained risk model")
                return
            except Exception as e:
                print(f"Could not load model: {e}")
        
        # Train with synthetic data for demo
        self._train_synthetic()
    
    def _train_synthetic(self):
        """Train model with synthetic data for demonstration"""
        # Generate synthetic training data
        np.random.seed(42)
        n_samples = 500
        
        # Features: [f1, f2, f3, f4, f5, f6, f7, f8]
        X = np.random.rand(n_samples, 8)
        
        # Scale features
        X[:, 0] = X[:, 0] * 10  # f1: log scale
        X[:, 1] = X[:, 1] * 20  # f2: files changed
        X[:, 2] = X[:, 2] * 10  # f3: commits
        X[:, 3] = X[:, 3] * 10  # f4: review comments
        X[:, 5] = X[:, 5] * 1   # f6: rejection rate
        X[:, 6] = X[:, 6] * 100 # f7: experience score
        
        # Generate labels based on risk factors
        # High risk: large diff, many files, high rejection rate, low experience
        y = (
            (X[:, 0] > 5).astype(int) * 0.3 +
            (X[:, 1] > 10).astype(int) * 0.2 +
            (X[:, 5] > 0.3).astype(int) * 0.3 +
            (X[:, 6] < 20).astype(int) * 0.2
        )
        y = np.clip(y, 0, 1).astype(int)
        
        # Train model
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        self.model.fit(X, y)
        self.is_trained = True
        
        # Store feature importances
        self.feature_importances_ = self.model.feature_importances_
        
        # Save model
        os.makedirs(os.path.join(os.path.dirname(__file__), '../../models'), exist_ok=True)
        model_path = os.path.join(os.path.dirname(__file__), '../../models/risk_model.joblib')
        joblib.dump(self.model, model_path)
        
        print("✅ Trained new risk model with synthetic data")
    
    def predict(self, features):
        """Predict risk score for PR features"""
        if not self.is_trained:
            self.load_or_train()
        
        if features.shape[1] != 8:
            raise ValueError(f"Expected 8 features, got {features.shape[1]}")
        
        # Get probability of high risk (class 1)
        probabilities = self.model.predict_proba(features)
        
        if probabilities.shape[1] == 2:
            return probabilities[:, 1]
        else:
            return probabilities[:, 0]
    
    def predict_batch(self, features):
        """Predict risk scores for multiple PRs"""
        if not self.is_trained:
            self.load_or_train()
        
        return self.model.predict_proba(features)[:, 1]
    
    def get_feature_importance(self, features):
        """
        Get feature importance for a specific prediction.
        Combines global feature importance with local feature values
        to determine which factors most influenced this prediction.
        """
        if not self.is_trained:
            self.load_or_train()
        
        # Get feature values
        feature_values = features[0] if features.ndim > 1 else features
        
        # Calculate impact based on feature importance and feature values
        # Higher values in high-importance features = higher impact
        impacts = []
        for i, (importance, value) in enumerate(zip(self.feature_importances_, feature_values)):
            # Normalize value to 0-1 range based on typical ranges
            normalized_value = min(value / 10, 1.0)  # Normalize to reasonable range
            impact = importance * normalized_value
            impacts.append({
                'feature': FEATURE_NAMES[i],
                'description': FEATURE_DESCRIPTIONS[FEATURE_NAMES[i]],
                'value': float(value),
                'importance': float(importance),
                'impact_weight': float(impact)
            })
        
        # Sort by impact weight descending
        impacts.sort(key=lambda x: x['impact_weight'], reverse=True)
        
        # Normalize impact weights to sum to 1
        total_impact = sum(item['impact_weight'] for item in impacts)
        if total_impact > 0:
            for item in impacts:
                item['impact_weight'] = round(item['impact_weight'] / total_impact, 2)
        
        # Return top 3 factors
        return impacts[:3]
    
    def get_risk_level(self, risk_score):
        """Determine risk level from score"""
        if risk_score < 0.4:
            return "Low"
        elif risk_score <= 0.7:
            return "Medium"
        else:
            return "High"


def generate_recommendations(features, risk_score, top_factors):
    """
    Generate actionable recommendations based on PR features and risk factors
    """
    recommendations = []
    
    # Extract feature values
    lines_added_deleted = features.f1  # log scale of lines
    files_changed = features.f2
    commits = features.f3
    review_comments = features.f4
    time_to_merge = features.f5
    rejection_rate = features.f6
    experience_score = features.f7
    churn_score = features.f8
    
    # Convert log scale back to approximate lines
    approx_lines = int(np.exp(lines_added_deleted) - 1)
    
    # Recommendation rules
    if approx_lines > 1500:
        recommendations.append("Consider splitting this PR into smaller modules to reduce review complexity.")
    
    if files_changed > 10:
        recommendations.append("This PR modifies multiple files - consider modular refactoring or breaking into smaller PRs.")
    
    if experience_score < 0.3:  # Low experience (normalized 0-1)
        recommendations.append("Assign a senior reviewer due to low contributor experience.")
    
    if churn_score > 0.6:
        recommendations.append("High file churn detected - consider refactoring before merge to reduce technical debt.")
    
    if time_to_merge > 0.5:
        recommendations.append("This PR has slow merge time - prioritize review or break into smaller parts.")
    
    if rejection_rate > 0.3:
        recommendations.append("Contributor has high rejection rate - ensure thorough testing before submission.")
    
    if commits > 5:
        recommendations.append("Multiple commits suggest iterations - consider squash merging for cleaner history.")
    
    if review_comments == 0 and risk_score > 0.5:
        recommendations.append("No review comments detected - request additional review or clarification.")
    
    # Add general recommendation based on overall risk
    if risk_score > 0.7 and len(recommendations) == 0:
        recommendations.append("This PR has high overall risk - consider additional testing and review cycles.")
    
    if len(recommendations) == 0:
        recommendations.append("PR looks good - proceed with standard review process.")
    
    return recommendations
