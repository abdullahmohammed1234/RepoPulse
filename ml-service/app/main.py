from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import os

from app.models.risk_model import RiskModel, generate_recommendations
from app.models.churn_model import ChurnModel
from app.models.anomaly_model import AnomalyModel

app = FastAPI(
    title="RepoPulse ML Service",
    description="Machine learning models for repository analytics",
    version="1.0.0"
)

# Initialize models
risk_model = RiskModel()
churn_model = ChurnModel()
anomaly_model = AnomalyModel()

# Feature models
class PRFeatures(BaseModel):
    f1: float  # log(1 + lines_added + lines_deleted)
    f2: float  # files_changed
    f3: float  # commits_count
    f4: float  # review_comments
    f5: float  # time_to_merge (normalized)
    f6: float  # contributor_rejection_rate
    f7: float  # contributor_experience_score
    f8: float  # average_churn_of_modified_files


class FileFeatures(BaseModel):
    additions: float = 0
    deletions: float = 0
    modifications: float = 0
    churn_history: float = 0


class ContributorFeatures(BaseModel):
    experience_score: float
    contributions: int
    rejection_rate: float


class RiskPredictionResponse(BaseModel):
    risk_score: float
    risk_level: str
    confidence: float
    model_used: str
    top_factors: list
    recommendations: list


class ChurnPredictionResponse(BaseModel):
    churn_probability: float
    churn_level: str
    model_used: str


class AnomalyResponse(BaseModel):
    anomaly_scores: list
    flagged_contributors: list
    model_used: str


@app.get("/")
async def root():
    return {
        "service": "RepoPulse ML Service",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/ml/train-risk-model", response_model=dict)
async def train_risk_model(request: dict):
    """Train the PR risk model"""
    try:
        repository_id = request.get("repository_id")
        # In production, fetch real training data from database
        # For now, use pre-trained model
        risk_model.load_or_train()
        return {
            "success": True,
            "message": "Risk model trained/loaded",
            "model_type": "RandomForestClassifier"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ml/predict-risk", response_model=RiskPredictionResponse)
async def predict_risk(features: PRFeatures):
    """Predict risk score for a pull request with explainable factors"""
    try:
        feature_array = np.array([[
            features.f1, features.f2, features.f3, features.f4,
            features.f5, features.f6, features.f7, features.f8
        ]])
        
        # Get risk score prediction
        risk_score = float(risk_model.predict(feature_array)[0])
        
        # Get risk level
        risk_level = risk_model.get_risk_level(risk_score)
        
        # Get top 3 contributing factors
        top_factors = risk_model.get_feature_importance(feature_array)
        
        # Format top factors for response
        formatted_factors = []
        for factor in top_factors:
            formatted_factors.append({
                "feature": factor['description'],
                "value": round(factor['value'], 2),
                "impact_weight": factor['impact_weight']
            })
        
        # Generate recommendations
        recommendations = generate_recommendations(features, risk_score, top_factors)
        
        return RiskPredictionResponse(
            risk_score=risk_score,
            risk_level=risk_level,
            confidence=0.85,
            model_used="RandomForestClassifier",
            top_factors=formatted_factors,
            recommendations=recommendations
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ml/predict-churn", response_model=ChurnPredictionResponse)
async def predict_churn(features: FileFeatures):
    """Predict file churn probability"""
    try:
        feature_array = np.array([[
            features.additions,
            features.deletions,
            features.modifications,
            features.churn_history
        ]])
        
        churn_prob = churn_model.predict(feature_array)[0]
        
        # Determine churn level
        if churn_prob > 0.8:
            churn_level = "critical"
        elif churn_prob > 0.6:
            churn_level = "high"
        elif churn_prob > 0.4:
            churn_level = "medium"
        else:
            churn_level = "low"
        
        return ChurnPredictionResponse(
            churn_probability=float(churn_prob),
            churn_level=churn_level,
            model_used="RandomForestRegressor"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ml/detect-anomalies", response_model=AnomalyResponse)
async def detect_anomalies(request: dict):
    """Detect contributor anomalies using Isolation Forest"""
    try:
        features = request.get("features", [])
        
        if not features:
            # Return empty result if no features provided
            return AnomalyResponse(
                anomaly_scores=[],
                flagged_contributors=[],
                model_used="IsolationForest"
            )
        
        feature_array = np.array([
            [f.get("experience_score", 0), f.get("contributions", 0), f.get("rejection_rate", 0)]
            for f in features
        ])
        
        anomaly_scores = anomaly_model.predict(feature_array)
        
        # Flag contributors with high anomaly scores
        flagged = []
        for i, score in enumerate(anomaly_scores):
            if score > 0.5:
                flagged.append({
                    "index": i,
                    "anomaly_score": float(score),
                    "flag": "Unusual activity pattern"
                })
        
        return AnomalyResponse(
            anomaly_scores=[float(s) for s in anomaly_scores],
            flagged_contributors=flagged,
            model_used="IsolationForest"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
