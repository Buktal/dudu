package com.dudu.duduserver.dto;

import com.dudu.duduserver.common.PageQuery;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 用户组及候选成员检索条件。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class ConsoleGroupQuery extends PageQuery implements ConsoleRequest {
    private String keyword;

    public String keyword() {
        return keyword == null ? "" : keyword.trim();
    }
}
