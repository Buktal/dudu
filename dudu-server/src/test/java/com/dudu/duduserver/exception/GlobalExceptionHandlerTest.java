package com.dudu.duduserver.exception;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.constant.ApiEnum;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.annotation.Validated;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.validation.method.MethodValidationResult;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @SuppressWarnings("unused")
    static class Sample {
        void handler(String name) {
        }
    }

    @Test
    void bizExceptionCarriesCodeAndCustomMsg() {
        R<Void> r = handler.onBiz(new BizException(ApiEnum.PARAM_ERROR, "name 不能为空"));

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("name 不能为空");
    }

    @Test
    void bizExceptionRoutesToItsEnumCode() {
        assertThat(handler.onBiz(new BizException(ApiEnum.TOKEN_EXPIRE)).code())
                .isEqualTo(ApiEnum.TOKEN_EXPIRE.code);
        assertThat(handler.onBiz(new BizException(ApiEnum.DATA_NOT_EXIST)).code())
                .isEqualTo(ApiEnum.DATA_NOT_EXIST.code);
        assertThat(handler.onBiz(new BizException(ApiEnum.THIRD_ERROR)).code())
                .isEqualTo(ApiEnum.THIRD_ERROR.code);
    }

    @Test
    void nullMsgFallsBackToEnumDesc() {
        assertThat(new BizException(ApiEnum.PARAM_ERROR, null).getMessage())
                .isEqualTo(ApiEnum.PARAM_ERROR.desc);
    }

    @Test
    void bindExceptionSurfacesFirstFieldMessage() throws NoSuchMethodException {
        BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "req");
        bindingResult.addError(new FieldError("req", "name", "不能为空"));
        MethodArgumentNotValidException e = new MethodArgumentNotValidException(
                new MethodParameter(Sample.class.getDeclaredMethod("handler", String.class), 0), bindingResult);

        R<Void> r = handler.onBind(e);

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("不能为空");
    }

    @Test
    void methodValidationSurfacesFirstMessage() throws NoSuchMethodException {
        Method method = Sample.class.getDeclaredMethod("handler", String.class);
        MethodParameter parameter = new MethodParameter(method, 0);
        ParameterValidationResult validationResult = new ParameterValidationResult(
                parameter, null, List.of(new FieldError("req", "name", "不能为空")));
        HandlerMethodValidationException e = new HandlerMethodValidationException(
                MethodValidationResult.create(new Object(), method, List.of(validationResult)));

        R<Void> r = handler.onMethodValidation(e);

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("不能为空");
    }

    @Test
    void constraintViolationSurfacesFirstMessage() {
        record Form(@NotBlank String name) {
        }
        Set<ConstraintViolation<Form>> violations =
                Validation.buildDefaultValidatorFactory().getValidator().validate(new Form(""));

        R<Void> r = handler.onConstraintViolation(new ConstraintViolationException(violations));

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("不能为空");
    }

    @Test
    void unreadableBodyMapsToParamError() {
        R<Void> r = handler.onBodyUnreadable(
                new HttpMessageNotReadableException("bad json", new MockHttpInputMessage(new byte[0])));

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_ERROR.code);
        assertThat(r.msg()).isEqualTo("请求体不可读");
    }

    @Test
    void missingParamNamesTheParameter() {
        R<Void> r = handler.onMissingParam(new MissingServletRequestParameterException("userId", "Long"));

        assertThat(r.code()).isEqualTo(ApiEnum.PARAM_MISSING.code);
        assertThat(r.msg()).isEqualTo("缺少参数 userId");
    }

    @Test
    void unknownFallsBackTo10001() {
        R<Void> r = handler.onUnknown(new IllegalStateException("boom"));

        assertThat(r.code()).isEqualTo(ApiEnum.UNKNOWN.code);
        assertThat(r.msg()).isEqualTo(ApiEnum.UNKNOWN.desc);
    }
}
