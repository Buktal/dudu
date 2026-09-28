package com.dudu.duduserver.config.response;

import com.dudu.duduserver.constant.ApiEnum;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RTest {

    @Test
    void okCarriesZeroCodeAndNullData() {
        R<Void> r = R.ok();

        assertThat(r.code()).isZero();
        assertThat(r.msg()).isEqualTo(ApiEnum.OK.desc);
        assertThat(r.data()).isNull();
    }

    @Test
    void okWithDataKeepsPayload() {
        record Item(int id) {
        }

        R<Item> r = R.ok(new Item(5));

        assertThat(r.code()).isZero();
        assertThat(r.data()).isEqualTo(new Item(5));
    }

    @Test
    void errUsesEnumCodeAndDesc() {
        R<Void> r = R.err(ApiEnum.TOKEN_EXPIRE);

        assertThat(r.code()).isEqualTo(ApiEnum.TOKEN_EXPIRE.code);
        assertThat(r.msg()).isEqualTo(ApiEnum.TOKEN_EXPIRE.desc);
        assertThat(r.data()).isNull();
    }

    @Test
    void errWithCustomMsgOverridesDesc() {
        R<Void> r = R.err(ApiEnum.PARAM_ERROR, "name 不能为空");

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("name 不能为空");
        assertThat(r.data()).isNull();
    }
}
