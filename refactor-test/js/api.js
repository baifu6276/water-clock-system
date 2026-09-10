// Google Apps Script API 呼叫
// 呼叫 GAS API
    // ==========================================

    async function callApi(
      data
    ) {

      const response =
        await fetch(
          GAS_URL,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "text/plain;charset=utf-8"

            },

            body:
              JSON.stringify(
                data
              ),

            redirect:
              "follow"

          }
        );


      if (!response.ok) {

        throw new Error(
          "伺服器連線失敗"
        );

      }


      const text =
        await response.text();


      try {

        return JSON.parse(
          text
        );

      } catch (error) {

        console.error(
          "API 原始回覆：",
          text
        );


        throw new Error(
          "伺服器回傳格式錯誤"
        );

      }

    }



    // ==========================================
