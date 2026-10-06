package com.dudu.duduserver.config.exception;

import com.dudu.duduserver.common.R;
import com.dudu.duduserver.constant.ApiEnum;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * 全局异常处理器：HTTP 恒 200（#6 决策），业务语义由 R.code 表达。
 * 业务异常记 warn 不带栈；未知异常记 error 带栈。
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public R<Void> onBiz(BizException e) {
        log.warn("[biz] 业务请求失败, code={}, message={}", e.apiEnum().code, e.getMessage());
        return R.err(e.apiEnum(), e.getMessage());
    }

    @ExceptionHandler(BindException.class)
    public R<Void> onBind(BindException e) {
        String msg = e.getAllErrors().stream()
            .findFirst()
            .map(MessageSourceResolvable::getDefaultMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public R<Void> onMethodValidation(HandlerMethodValidationException e) {
        String msg = e.getParameterValidationResults().stream()
            .flatMap(result -> result.getResolvableErrors().stream())
            .findFirst()
            .map(MessageSourceResolvable::getDefaultMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public R<Void> onConstraintViolation(ConstraintViolationException e) {
        String msg = e.getConstraintViolations().stream()
            .findFirst()
            .map(ConstraintViolation::getMessage)
            .orElseGet(() -> ApiEnum.PARAM_ERROR.desc);
        return R.err(ApiEnum.PARAM_ERROR, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public R<Void> onBodyUnreadable(HttpMessageNotReadableException e) {
        log.warn("[param] 请求体不可读, exception={}", e.getClass().getSimpleName());
        return R.err(ApiEnum.PARAM_ERROR, "请求体不可读");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public R<Void> onMissingParam(MissingServletRequestParameterException e) {
        return R.err(ApiEnum.PARAM_MISSING, "缺少参数 " + e.getParameterName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public R<Void> onTypeMismatch(MethodArgumentTypeMismatchException e) {
        return R.err(ApiEnum.PARAM_ERROR, "参数 " + e.getName() + " 类型错误");
    }

    @ExceptionHandler(Exception.class)
    public R<Void> onUnknown(Exception e) {
        log.error("[unknown] 请求处理失败", e);
        return R.err(ApiEnum.UNKNOWN);
    }
}
