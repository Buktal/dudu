package com.dudu.duduserver.config.validate;

import jakarta.validation.Validation;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ValidationGroupsTest {

    record Form(@NotBlank String name,
                @Min(value = 1, groups = Save.class) int amount,
                @Min(value = 1, groups = Query.class) int page) {
    }

    @Test
    void saveIncludesDefaultConstraintsAndItsOwnConstraints() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(new Form("", 0, 0), Save.class))
                    .extracting(violation -> violation.getPropertyPath().toString())
                    .containsExactlyInAnyOrder("name", "amount");
        }
    }

    @Test
    void queryIncludesDefaultConstraintsAndItsOwnConstraints() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertThat(factory.getValidator().validate(new Form("", 0, 0), Query.class))
                    .extracting(violation -> violation.getPropertyPath().toString())
                    .containsExactlyInAnyOrder("name", "page");
        }
    }
}
