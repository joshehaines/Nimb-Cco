def test_places_near_shapes_and_filters(make_client, place_row):
    client, conn = make_client([("from places", [place_row])])
    r = client.get("/api/places", params={"lon": -1.5365, "lat": 52.289, "radius": 400, "sector": "Pub"})
    assert r.status_code == 200
    body = r.json()
    assert body[0]["id"] == "p1" and body[0]["sector"] == "Pub" and body[0]["distanceM"] == 42
    assert body[0]["location"] == {"type": "Point", "coordinates": [-1.5365, 52.289]}
    sql, args = conn.calls[-1]
    assert "ST_DWithin" in sql and args[:4] == (-1.5365, 52.289, 400.0, "Pub")


def test_place_by_id_404(make_client):
    client, _ = make_client([("from places", [])])
    assert client.get("/api/places/nope").status_code == 404


def test_price_paid_near_and_by_id(make_client, sale_row):
    client, conn = make_client([("from price_paid", [sale_row])])
    r = client.get("/api/price-paid", params={"lon": -1.5365, "lat": 52.289, "radius": 250, "type": "O", "limit": 5})
    assert r.status_code == 200
    s = r.json()[0]
    assert s["price"] == 1250000 and s["date"] == "2025-08-29" and s["type"] == "O" and s["distanceM"] == 10
    assert conn.calls[-1][1] == (-1.5365, 52.289, 250.0, "O", 5)
    r = client.get("/api/price-paid/T1")
    assert r.status_code == 200 and r.json()["geocode"] == "postcode"


def test_traffic_near(make_client, traffic_row):
    client, _ = make_client([("from traffic_counts", [traffic_row])])
    r = client.get("/api/traffic", params={"lon": -1.55, "lat": 52.29, "radius": 1000})
    t = r.json()[0]
    assert t["countPointId"] == "17070" and t["history"][-1]["aadf"] == 13797 and t["source"] == "DfT Road Traffic Statistics"


def test_map_open_data_feature_collections(make_client, place_row, sale_row):
    geo = {"type": "Point", "coordinates": [-1.5365, 52.289]}
    client, conn = make_client([("from places", [dict(place_row, geom=geo)]), ("from price_paid", [dict(sale_row, geom=geo)]), ("from buildings", [])])
    r = client.get("/api/map/open-data", params={"bbox": "-1.6,52.27,-1.5,52.31", "buildings": "true"})
    assert r.status_code == 200
    body = r.json()
    assert body["poi"]["type"] == "FeatureCollection" and body["poi"]["features"][0]["properties"]["sector"] == "Pub"
    assert body["pricePaid"]["features"][0]["properties"]["date"] == "2025-08-29"
    assert "buildings" in body
    assert conn.calls[0][1] == (-1.6, 52.27, -1.5, 52.31)


def test_health_counts(make_client):
    client, _ = make_client([("from titles", 12), ("from places", 1343), ("from price_paid", 19834)])
    assert client.get("/api/health").json() == {"ok": True, "provider": "postgis", "titles": 12, "places": 1343, "pricePaid": 19834}
