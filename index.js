const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

// 대상 서버 URL (머지된 + 라인을 전송할 엔드포인트)
// const TARGET_SERVER_URL = 'https://myserver.com/hook';

// 깃헙에서 Webhook 호출 시 이 라우트가 실행됨
app.post('/github-webhook', async (req, res) => {
  console.log('req : ', req.body)
  
  try {
    // GitHub에서 오는 이벤트 타입
    const ghEvent = req.headers['x-github-event'];

    // 1) Pull Request 이벤트인가?
    if (ghEvent === 'pull_request') {
      const action = req.body.action;
      const pullRequest = req.body.pull_request;

      // 2) 머지 되었는지 확인
      if (action === 'closed' && pullRequest.merged) {
        // PR 번호, 저장소 정보 추출
        const prNumber = pullRequest.number;
        const repoName = req.body.repository.name;
        const ownerName = req.body.repository.owner.login;

        console.log(`PR #${prNumber}가 머지되었습니다.`);

        // 3) diff(머지된 커밋의 변경 내용) 가져오기
        // GitHub API: GET /repos/{owner}/{repo}/pulls/{pull_number}
        // => 헤더에 'Accept': 'application/vnd.github.v3.diff' 를 주면 diff 형식으로 받아올 수 있음
        //    또는 commits API를 호출해도 됨
        const diffUrl = pullRequest.diff_url; 

        console.log(`diff_url: ${diffUrl}`);
        // diff_url은 이미 pull_request 객체에 포함되어 있음

        // diff_url을 직접 요청해서 diff 텍스트를 받아옴
        const diffResponse = await axios.get(diffUrl, {
          headers: {
            'Accept': 'application/vnd.github.v3.diff',
          },
        });
        const diffData = diffResponse.data;

        // 4) diffData에서 +로 시작하는 라인(+/- 기호가 붙는 부분) 중, +++ --- 같은 메타데이터 제외
        const addedLines = [];
        const diffLines = diffData.split('\n');

        for (const line of diffLines) {
          // 라인 앞에 "+++" 나 "@" 같은 diff 메타 정보가 있음
          // 보통 실제 소스 추가 라인은 " +무언가" 형태.
          // (주의: "+++ b/filename"와 같이 시작하는 것은 파일 경로 표시이므로 제외)
          if (line.startsWith('+') && 
              !line.startsWith('+++') && 
              !line.startsWith('++ ') && 
              !line.startsWith('+--') && 
              !line.startsWith('@@')) {
            // 맨 앞의 '+' 기호는 제거
            addedLines.push(line.substring(1));
          }
        }

        // 5) 특정 서버로 전송할 payload 구성
        const payload = {
          repository: repoName,
          pullRequestNumber: prNumber,
          mergedBy: pullRequest.merged_by.login,
          addedLines: addedLines,
        };

        // 6) 특정 서버에 POST 요청
        // await axios.post(TARGET_SERVER_URL, payload);

        // console.log(`추출된 +라인 ${addedLines.length}개를 ${TARGET_SERVER_URL}로 전송 완료`);

        // 응답
        return res.status(200).json({ message: 'OK, processed merge event' });
      }
    }

    // Pull Request merged 이외의 이벤트 -> 그냥 200 OK
    res.status(200).json({ message: 'Not a merged pull_request event' });
  } catch (error) {
    console.error('에러 발생:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3000 포트로 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});