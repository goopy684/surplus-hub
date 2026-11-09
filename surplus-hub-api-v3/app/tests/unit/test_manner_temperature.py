from app.crud.crud_review import BASE_MANNER_TEMPERATURE, manner_temperature


def test_single_five_star_review_does_not_jump_to_max():
    # SH-43: 5점 후기 1건으로 36.5 -> 90.0이 되던 문제
    temp = manner_temperature(5.0, 1)
    assert BASE_MANNER_TEMPERATURE < temp < 45


def test_more_reviews_move_further_from_base():
    assert manner_temperature(5.0, 1) < manner_temperature(5.0, 10) < manner_temperature(5.0, 100) < 90


def test_low_ratings_shrink_toward_base_too():
    assert 30 < manner_temperature(1.0, 1) < BASE_MANNER_TEMPERATURE
