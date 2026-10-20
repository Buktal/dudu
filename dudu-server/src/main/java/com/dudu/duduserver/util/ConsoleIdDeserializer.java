package com.dudu.duduserver.util;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;
import java.io.IOException;

/**
 * Console ID 只接收十进制 JSON 字符串，不允许 Jackson 将数值隐式转换为字符串。
 */
public class ConsoleIdDeserializer extends JsonDeserializer<String> {
    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (!parser.hasToken(JsonToken.VALUE_STRING)) {
            throw JsonMappingException.from(parser, "ID 必须为十进制字符串");
        }
        String value = parser.getText();
        ConsoleIds.parse(value);
        return value;
    }
}
