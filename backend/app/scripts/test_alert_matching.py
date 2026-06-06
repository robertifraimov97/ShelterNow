from app.services.alert_matching import classify_alert_relevance

result = classify_alert_relevance(
    affected_areas=["רמת השרון", "כפר סבא"],
    current_city="רמת השרון",
    followed_areas=["כפר סבא", "הרצליה"],
)

print(result)

# 1. רק אזור במעקב
print(classify_alert_relevance(
    affected_areas=["כפר סבא"],
    current_city="רמת השרון",
    followed_areas=["כפר סבא", "הרצליה"],
))

# 2. לא רלוונטי בכלל
print(classify_alert_relevance(
    affected_areas=["אשדוד"],
    current_city="רמת השרון",
    followed_areas=["כפר סבא", "הרצליה"],
))